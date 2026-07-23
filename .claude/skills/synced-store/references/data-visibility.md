<!-- owner: jyoung-q -->
# Data Visibility Tiers

Synced-store enforces visibility at the server API boundary via key prefixes. Every table belongs to exactly one tier — pick it before you design the schema, not after.

## The Three Tiers

- **Public** (default) — `ctx.table(name)` — synced to every user in the app instance.
- **Per-user private** — `ctx.privateOfUser(userId).table(name)` — synced only to that user. Write one copy per recipient.
- **Server-only** — `ctx.serverOnly().table(name)` — never synced to any client; only server-side mutators/actions read it. Expose derived results via actions.

## When to Reach for Non-Public Tiers

**Role-restricted state** — spymaster's color key in Spy Words, dealer's deck in a card game, judge's secret prompt. Use `privateOfUser(roleHolderId)` and write a copy per role-holder when roles are assigned.

**Server-evaluated secrets** — answer keys, RNG seeds, scoring weights, unrevealed puzzle solutions. Use `serverOnly()` and expose results through [actions](actions.md).

**Per-user private state** — draft notes, private preferences, unread markers, unshared progress. Use `privateOfUser(userId)`.

## Red Flag

If you're proposing client-side filtering, client-side encryption, or gating every read through an action just to hide data — you want `privateOfUser` or `serverOnly` instead. The platform already solves this at the API boundary.

## Method Access Matrix

| Method | Client | Server |
|--------|--------|--------|
| `ctx.table(name)` | Read/write **(public rows only)** | Read/write **(public rows only)** |
| `ctx.privateOfUser(ctx.userId)` | Read/write (own only) | Read/write |
| `ctx.privateOfUser(otherUserId)` | Throws | Read/write |
| `ctx.serverOnly()` | Throws | Read/write |

`ctx.table("name")` and `ctx.privateOfUser(userId).table("name")` are **separate namespaces** — even though they share a table name in the schema, the rows live under different storage prefixes (`{table}` vs `$$pu/{userId}/{table}`). Reading or writing one never touches the other.

`privateOfUser(userId)` requires a non-empty `userId` without `/`, because `/` separates the user-id segment from the table-name segment in that storage prefix.

## Read your own private rows

Writing private data via `ctx.privateOfUser(ctx.userId).table(...).set(...)` is the part most people remember. The mirror — that READING your own private rows ALSO needs `privateOfUser` — bites every time.

```typescript
// In a mutator handler — server fan-out to teammates' private stores
sendTeamChat: async (ctx, input) => {
  if (!ctx.isServer) return;
  const message = { id: input.id, userId: ctx.userId, text: input.text };
  for (const allyId of [ctx.userId, allyUserId]) {
    await ctx.privateOfUser(allyId).table("teamChat").set({
      itemKey: input.id,
      value: message,
    });
  }
},

// In the UI — to see your own teamChat row, you MUST go through privateOfUser
const { data: teamChatRaw } = createLiveQuery(
  () => store,
  () => (tx) => tx.privateOfUser(tx.userId).table("teamChat").entries().toArray(),
  //          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //          NOT tx.table("teamChat") — that namespace is empty
);

// Same in a one-shot query (e.g. tests)
const view = await store.query((tx) =>
  tx.privateOfUser(tx.userId).table("teamView").get("state"),
);
```

Reading another user's private rows is rejected on the client with a thrown error; only the server can do that. So in practice, every UI / test read of a private table goes through `tx.privateOfUser(tx.userId)`.

## Hooks can write app private rows

System hooks (`onInit`, `onAddUsers`, `onRemoveUser`, `onAnonymizeUser`, `onSetTitle`, `onGrantPermission`, `onRevokePermission`, `onAddTileInstanceToRoom`, `onChangeTileParent`, `onAddChildTile`, `onChildInstancesAdded`, `onRoomMemberInstanceMovedOut`) run inside a system mutator, but app-owned public tables, server-only tables, and private tables are still app data. A hook may write `ctx.privateOfUser(otherUserId).table(...)` on the server when the write is a durable per-user projection tied directly to the hook event. Hooks still must not write reserved system tables such as `$users` or `$$system` directly. `onInit` can read the current room topology from `await ctx.table("$$system").get("room")`; `ctx.userId` identifies the initiating user for user/external-store bootstraps. Use it for deterministic bootstrap rows, such as an initial activity message (`"{name} started the group"`). Child-room `onInit` also receives `parentRoomUsers`, a **read-only snapshot** of the parent room's active roster — use it to react to the parent roster (a fresh rootGroup genesis always has an empty `parentRoomUsers`), never to admit members. Membership is platform-owned: the host seats the launcher at genesis (both users when launched from a 2-person room, i.e. a DM), and everyone else joins through the host picker/invite flows. `onAddUsers` runs after the `$users` row is written, so it can read `addedBy` / `addedBatchUserIds` to auto-seat users or write membership activity such as `"{name} added {usernames...}"`. For user-initiated cross-user fan-out, prefer a regular mutator or an action enqueued with `ctx.enqueueAction(...)`.

Wire every hook into both `defineBackendConfig({ hooks })` and `defineClientConfig({ hooks })`. Client hook runs are optimistic seed data for fresh prepared stores, so they must be browser-safe: use public or current-user-readable data, avoid backend imports and platform calls, and guard server-only table/private-other-user writes behind `ctx.isServer`.
