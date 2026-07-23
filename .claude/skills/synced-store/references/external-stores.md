<!-- owner: jyoung-q -->
# External Stores: Cross-App Reads & Writes

Mutators and actions can interact with other store instances on the server. Mutators can write via `ctx.mutateExternal(...)`; mutators and actions can read via `ctx.externalStore(...)`. Receiving code identifies the caller via `ctx.source`.

## External Mutations (Writes)

A mutator can dispatch mutations to a different store using `ctx.mutateExternal()`. This enables cross-app communication — for example, a child app notifying its parent.

```typescript
notifyParent: async (ctx, input) => {
  // Update local state
  await ctx.table("status").set({
    itemKey: "notification",
    value: { sent: true },
  });

  // Dispatch a mutation to the parent store
  ctx.mutateExternal({
    storeTypeId: input.parentTypeId,
    instanceId: input.parentInstanceId,
    mutationName: "receiveChildNotification",
    input: { message: input.message },
  });
},
```

The target store must have a mutator with the matching name. External mutations are committed atomically after the source mutation succeeds.

### Passing the target store identity

Since mutators run on both client and server, they can't access client-only APIs like `Poe.parent`. Instead, pass the target store identity as mutation input from client code:

```javascript
// Client code — read parent identity from Poe.parent
await store.mutate.notifyParent({
  parentTypeId: Poe.parent.storeTypeId,
  parentInstanceId: Poe.parent.instanceId,
  message: "hello from child",
});
```

### Constraints

- Max 200 unique external mutation targets per commit (each target = `(storeTypeId, instanceId)` pair; multiple mutations to the same target count as one)
- Max depth of 1 — target mutators cannot trigger further external **writes** (`blockExternalMutations: true`). External **reads** are not affected
- External mutations expire after 5 minutes if not committed

## External Reads

A mutator or action can read from another store using `ctx.externalStore({ storeTypeId, instanceId })`. The handle exposes `.table(name)` with `get`, `scan`, and `entries` (read-only).

```typescript
// In a mutator or action:
const ext = ctx.externalStore({ storeTypeId: "emoji-prefs", instanceId: ctx.userId });
const favorites = await ext.table("preferences").get("favorites");
const recent = await ext.table("entries").scan({ limit: 50 }).values().toArray();
```

In actions, the handle also exposes `.action(name, input)` and `.getSchema()`.

```typescript
// In an action only:
const ext = ctx.externalStore({ storeTypeId: "chat", instanceId: "room-1" });
const result = await ext.action("summarize", { limit: 100 });
const schema = await ext.getSchema();
```

### Reads vs writes

- **Server-only path**: on the client, `ctx.externalStore(...).table(...).get(...)` is a no-op stub that returns empty results. Don't depend on optimistic external reads
- **No depth limit**: reads are stateless (no commits, no broadcasts, no retries) and are allowed inside external dispatch targets and action-invoked mutators — unlike writes
- **Bounded**: a single scan/list returns at most `MAX_EXTERNAL_READ_ITEMS` (1000) and `MAX_EXTERNAL_READ_BYTES` (1 MB). Response carries a `truncated` flag when limits were hit
- **Timeout**: `EXTERNAL_READ_TIMEOUT_MS` = 5s for the dispatch RPC

### Client-side external reads

Iframe apps can read from another store via `Poe.externalStore({ storeTypeId, instanceId })` — call `await ext.waitForBootstrap()` first, then read with `await ext.table(...).get(...)`, `await ext.privateOfUser(userId).table(...).get(...)`, or the older `await ext.query((tx) => tx.table(...).get(...))` callback form. This is a one-shot snapshot read against locally-synced data.

For a **live** cross-store read, use `ext.subscribe(queryFn, onResult)` instead of polling or re-reading:

```typescript
const ext = Poe.externalStore({ storeTypeId: "chat", instanceId: parentRoomId });
const unsubscribe = ext.subscribe(
	async (tx) => tx.table("$meta").get("_title"),
	(title) => renderGroupName(title),
);
// later, e.g. on unmount:
unsubscribe();
```

`queryFn` runs immediately against the current local snapshot (possibly empty before the first sync — pair with `waitForBootstrap()` when the initial value matters) and re-runs after each change of the target store, including this device's own not-yet-confirmed writes to it (e.g. another tile mutating that same store on this device) — the preview converges to the authoritative value once the server confirms. Only THIS device's own pending writes can appear this way; a change made from a different device still needs the server round trip. While subscribed, the host keeps the target store syncing. The host bounds how many distinct stores one app can watch at once; `subscribe` throws beyond that limit. Always call the returned unsubscribe function when the UI goes away.

## `ctx.source` — identifying the caller

`ctx.source` is a `ContextSource` discriminated union exposed on `MutationContext`, `QueryContext`, and `ActionContext`. It tells receiving code who triggered this request.

```typescript
type ContextSource =
  | { type: "user"; userId: string }
  | {
      type: "external-store";
      userId: string;
      store: { typeId: string; instanceId: string };
      room: { storeTypeId: string; instanceId: string };
    }
  | { type: "system" };
```

| Variant | When you see it |
|---------|-----------------|
| `"user"` | Normal client mutation/query/action |
| `"external-store"` | Dispatched from another store via `ctx.mutateExternal(...)`. `ctx.source.store` carries the **source** identity (typeId + instanceId); `ctx.source.userId` is the user who triggered the source mutation; `ctx.source.room` carries the **source's resolved room ref** (see below) |
| `"system"` | System mutation (e.g. platform-issued `$addUsers`) or hook invocation. No `userId` field |

### Using `ctx.source` in receiving mutators

External-dispatch targets typically gate on `ctx.source.type` and read identity from `ctx.source.store` — don't make callers stuff typeId/instanceId into the input.

```typescript
receiveActivity: async (ctx, input) => {
  if (ctx.source.type !== "external-store") {
    throw new Error("receiveActivity must be called via external dispatch");
  }
  const { typeId, instanceId } = ctx.source.store;
  const sourceUserId = ctx.source.userId;
  const sourceRoom = ctx.source.room; // always defined on external-store
  // ...
},
```

### `ctx.source` on the client (optimistic) vs server (authoritative)

`ctx.source` is populated identically when the mutator runs optimistically on the client and authoritatively on the server, so branching on `ctx.source.type` is rebase-safe. To gate behavior between optimistic and server runs intentionally, use `ctx.isServer`.

Note that `userId` is only present on the `"user"` and `"external-store"` variants — `"system"` has no userId. Narrow on `ctx.source.type` before reading it.

### Platform-augmented fields on `ctx.source`

Poe Tiles stamps extra fields onto `ctx.source` via TypeScript module augmentation. They are populated by the trusted server from authoritative state — never read from app input — and ride through external dispatch automatically (`createExternalStoreOrigin` propagates whole-origin fields from the dispatching source's origin; `room` is freshly resolved server-side from the source's pinned `$$system:room`).

| Field | Type | Variants | Populated when |
|-------|------|----------|----------------|
| `ctx.source.room` | `{ storeTypeId: string; instanceId: string }` | **external-store only — required** | Every cross-store dispatch carries the source's resolved room ref. If the source's `$$system:room` is `{type:"self"}` (the default for self-contained stores), `room` equals the source store's own identity. If the source is a member of a foreign room, `room` is that room ref. |
| `ctx.source.parent` | `{ typeId: string; instanceId: string } \| undefined` | all variants | The instance is a sub-app opened via `apps.openChild`. Carries the **immediate parent**'s identity — for a 3-level mount the grandchild's `parent` is the sub-app, not the root. Undefined for root apps. |

```typescript
recordOpenedFromContext: async (ctx, input) => {
  // ctx.source.parent is undefined when the request comes from a root app.
  const parent = ctx.source.parent;
  // ctx.source.room is REQUIRED on external-store — narrow on type first.
  const room = ctx.source.type === "external-store" ? ctx.source.room : null;
  await ctx.table("audit").set({
    itemKey: input.eventId,
    value: {
      sourceRoom: room,
      parentTypeId: parent?.typeId ?? null,
    },
  });
},
```

The `parent` field is not stamped on the iframe-side optimistic run of a mutator (`platform_fields` are stamped host-side). Read it under `ctx.isServer` or wait for the server-confirmed row when assertions depend on it. The `room` field is server-resolved per-dispatch and may be missing on optimistic runs; receiving code that depends on `room` should gate on `ctx.isServer` (or wait for the server-confirmed row) when asserting in tests.
