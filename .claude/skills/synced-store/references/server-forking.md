<!-- owner: jyoung-q -->
# Forking Mutator Logic with `ctx.isServer`

Mutators run on both the client (optimistically) and the server (authoritatively). `ctx.isServer` lets you branch behavior between those two runs. Use it sparingly — the whole point of mutators is that the two runs converge.

## Legitimate Uses

### Pending Indicators

Show a "pending" state on the client that disappears when the server confirms:

```typescript
sendMessage: async (ctx, input) => {
  await ctx.table("messages").set({
    itemKey: input.id,
    value: {
      text: input.text,
      isPending: !ctx.isServer,  // true on client, false on server
    },
  });
},
```

The optimistic client write sets `isPending: true`; when the server run lands, its write replaces the row with `isPending: false`. The UI can render a subtle "sending..." indicator on pending items.

### Server-Only Writes

Writes to `ctx.serverOnly()` throw on the client. Guard them:

```typescript
joinRound: async (ctx, input) => {
  await ctx.table("players").set({
    itemKey: ctx.userId,
    value: { name: input.name, score: 0 },
  });

  if (ctx.isServer) {
    await ctx.serverOnly().table("audit").set({
      itemKey: ctx.userId,
      value: { joinedAt: Date.now() },
    });
  }
},
```

### Cross-User Private Writes

`ctx.privateOfUser(otherUserId)` throws on the client when the target isn't `ctx.userId` (see [data-visibility.md](data-visibility.md) access matrix). Guard with `ctx.isServer`:

```typescript
startRound: async (ctx) => {
  // Validate on both sides so invalid calls fail fast on the caller's UI.
  const players = (await ctx.table("players").entries().toArray()).map(([, v]) => v);
  const redSpymaster = players.find((p) => p.team === "red" && p.role === "spymaster");
  if (!redSpymaster) throw new Error("need a red spymaster");

  // Cross-user private writes (and any non-deterministic generation) are
  // server-only. The caller's UI shows a brief "starting..." state until
  // the server-confirmed writes arrive.
  if (!ctx.isServer) return;

  const colors = assignColors();  // Math.random — server-only is fine
  for (const { index, color } of colors) {
    await ctx.privateOfUser(redSpymaster.userId).table("cardColors").set({
      itemKey: String(index),
      value: { index, color },
    });
  }
},
```

### Skip Optimistic Entirely When the Outcome Depends on Unreadable Data

Sometimes a mutator's outcome depends on data the caller can't read — another user's `privateOfUser` scope, or a `serverOnly` table. The client can't compute the full result, so any optimistic write is partial and the UI has to render an ambiguous in-between state. Usually cleaner to skip optimistic entirely:

```typescript
revealCard: async (ctx, input) => {
  // Validate on both sides so stale clicks (wrong phase / inactive team)
  // fail fast on the caller's UI.
  const phase = await ctx.table("game").get("phase");
  if (phase !== "guessing") throw new Error(`bad phase: ${phase}`);
  // ... other validation

  // Outcome depends on reading a spymaster's private scope — caller can't.
  // Skip optimistic; the click takes ~1 round-trip but the state transition
  // is a single clean step (unrevealed → fully-resolved) instead of a
  // half-filled flicker.
  if (!ctx.isServer) return;

  const color = await ctx.privateOfUser(spymasterId).table("cardColors").get(...);
  await ctx.table("cards").set({ itemKey, value: { revealed: true, revealedAs: color } });
  // ... update scores / switch turn / check winner
},
```

The alternative is to write a structured "pending" marker like in the [Pending Indicators](#pending-indicators) pattern — use that only when the UI benefits enough from immediate feedback to justify rendering a partial state explicitly. Never write a half-filled state (e.g., `revealed: true` but `revealedAs: null`) without a marker field the UI checks.

### Not Needed For `ctx.enqueueAction`

`ctx.enqueueAction(...)` is already a no-op on the client — call it unconditionally, no `ctx.isServer` guard required. The action only runs on the server after the triggering mutation commits.

```typescript
// ✅ No guard needed
ctx.enqueueAction("generateWithAI", { id, prompt });

// ❌ Redundant — enqueueAction is already a client no-op
if (ctx.isServer) {
  ctx.enqueueAction("generateWithAI", { id, prompt });
}
```

## Don't Do This

- **Don't put expensive client-only work inside `!ctx.isServer`.** If the work is client-only, do it in the UI layer, not inside the mutator.
- **Don't fork to work around non-determinism — usually.** If you're tempted to use `Date.now()` or `Math.random()` in one branch, pass the value as mutator input instead (the caller generates once; both client and server runs see the same value). **Exception:** when the non-deterministic value must stay hidden from the caller — e.g., generating a Spy Words color assignment a guesser is about to click through. Passing the seed as input would let the caller read it from their own local mutation log. In that case, put the generation behind `if (!ctx.isServer) return;` (see [Skip Optimistic Entirely](#skip-optimistic-entirely-when-the-outcome-depends-on-unreadable-data) above) and accept the ~1 round-trip latency.
- **Don't use `ctx.isServer` to reach different data conclusions** (e.g. reading different tables on client vs server). The two runs must converge on the same state.
