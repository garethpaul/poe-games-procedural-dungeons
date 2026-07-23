<!-- owner: jyoung-q -->
# SyncedStoreClient API Reference

Full reference for the store client returned by `Poe.setupStore(...)`. For the typed wrapper, see `InferSyncedStoreClient<Schema>` in [api-patterns.md](api-patterns.md).

## Typed Client

```typescript
import type { InferSyncedStoreClient } from "poe-tiles-sdk/v1/client.js";
import type { TodoSchema } from "./schema";

export type TodoStoreClient = InferSyncedStoreClient<TodoSchema>;
// Gives you typed: store.mutate.setTodo, store.subscribe, store.action.generateWithAI, etc.
```

## Reading Data

### `query(fn)` — One-time read

```typescript
const todo = await store.query((ctx) => ctx.table("todos").get("todo-1"));
```

### `subscribe(queryFn, callback)` — Reactive updates

Callback fires immediately, then on every change. Returns an unsubscribe function.

```typescript
const unsub = store.subscribe(
  (ctx) => ctx.table("todos").entries().toArray(),
  (todos) => renderTodoList(todos),
);
```

## Writing Data

### `mutate` — Optimistic mutations

```typescript
const { id, confirmed } = await store.mutate.setTodo({ id: "abc", text: "Buy milk" });
await confirmed; // optionally wait for server
```

Use `pendingMutationDedupeKey` for high-frequency, last-value-wins setters where intermediate offline values do not matter:

```typescript
await store.mutate.setPosition(
  { playerId, x, y },
  { pendingMutationDedupeKey: `player-position:${playerId}` },
);
```

A live client keeps all optimistic pending mutations. If the app is restored from local storage or the offline push queue drains after reconnect, intermediate pending mutations with the same key may be skipped so only the first and latest queued/restored mutations are sent or restored. Use this only for idempotent/state-setting mutations such as cursor or player position updates. Do not use it when later pending mutations depend on skipped intermediate values, or when every mutation represents a distinct event that the server must observe.

### `action` — Server-side actions

Waits for pending mutations to flush first, then calls the server.

```typescript
const result = await store.action.generateWithAI({ id: "abc", prompt: "dinner ideas" });
```

## Connection & State

| Property / Method | Returns |
|-------------------|---------|
| `state` | `'initializing'` \| `'ended'` |
| `connectionStatus` | `'connecting'` \| `'connected'` \| `'disconnected'` |
| `isOnline` | `boolean` |
| `isBootstrapped` | `boolean` (authoritative data ready to render) |
| `hasServerData` | `boolean` (first server pull response arrived this session) |
| `isEnded()` | `boolean` |
| `endReason` | `'kicked'` \| `'auth_failed'` \| `'application'` \| `null` |

## Waiting for Data

None of these are required — queries and mutations work immediately.

| Method | Resolves when |
|--------|--------------|
| `waitForLocalData()` | Device storage loaded |
| `waitForServerData()` | First server pull completes |
| `waitForBootstrap()` | Authoritative data is ready to render (either source) |

## IDs

```typescript
const ordinal = await store.getClientOrdinal(); // Sequential: 0, 1, 2...
const id = await store.makeUniqueId();          // Sortable: "5-61"
```

## Pending Mutations

```typescript
const pending = await store.getPendingMutations();
const count = store.getPendingCount();
await store.waitForSync(); // Wait for all pending to confirm

store.onPendingMutationsChanged((mutations) => {
  showSavingIndicator(mutations.length > 0);
});
```

## Subscriptions

```typescript
store.subscribeToConnectionStatus((status) => { /* ... */ });
store.onOnlineChanged((isOnline) => { /* ... */ });
store.subscribeToTable("todos", (entries, changes, ctx) => {
  // ctx.userId — current user ID
  // First callback: all entries appear in changes.added (compared against empty)
  // Subsequent: changes.added, changes.modified, changes.removed are deltas
});
store.subscribeToScanEntries("user:", (entries, changes) => { /* ... */ });
```

All subscription methods return an unsubscribe function.

## Error & Lifecycle Events

```typescript
store.onFailedMutation((info) => {
  console.error(`${info.mutation.name} failed:`, info.error.message);
});
store.onBackgroundError((error) => {
  const message =
    error.kind === "failed_mutation" ? error.info.error.message : error.message;
  showToast(message);
});
store.onKicked((reason) => { /* duplicate clientId or admin action */ });
store.onAuthFailed((reason) => { /* expired token */ });
store.onDisposed(() => { /* cleanup */ });
```

## Cleanup

```typescript
store.dispose(); // Closes WebSocket, clears timers. Not reversible.
```
