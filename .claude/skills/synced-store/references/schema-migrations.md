<!-- owner: jyoung-q -->
# Schema Migrations

Only increment `TILE_SCHEMA_VERSION` for backwards-incompatible changes that require migrating existing persisted data or pending mutations. DO NOT BUMP SCHEMA VERSION WHEN MERELY ADDING A NEW MUTATION OR A NEW FIELD ON A TABLE. The version lives in its own constant file (set up from day zero — see [api-patterns.md](api-patterns.md)) so client and server read the same value without bundling Zod on the client:

```
tile-schema-version.ts   ← export const TILE_SCHEMA_VERSION = 2;
schema.ts               ← uses TILE_SCHEMA_VERSION in defineSchema()
client-config.ts        ← uses TILE_SCHEMA_VERSION in defineClientConfig()
```

When versions mismatch without a migration, the client clears local data, fires `onSchemaVersionMismatch`, and disposes.

## Defining a Migration

Provide migrations for each version step:

```typescript
import { defineMigration } from "poe-tiles-sdk/v1/backend.js";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

const migration1to2 = defineMigration(v1Mutators, v2Mutators, {
  migrateData: async (ctx) => {
    // Transform existing data
    const items = await ctx.table("todos").scan().entries().toArray();
    for (const [key, value] of items) {
      await ctx.table("todos").set({
        ...key,
        value: { ...value, priority: 0 },
      });
    }
  },
  migratePendingMutation: {
    // Transform in-flight mutations from old clients
    addTodo: (args, emit) => {
      emit("addTodo", { ...args, priority: 0 });
    },
  },
});

const schema = defineSchema({
  schemaVersion: TILE_SCHEMA_VERSION, // bumped to 2 in tile-schema-version.ts
  migrations: { "1to2": migration1to2 },
  // ...
});
```

## Pending Mutation Handlers

Each mutation handler in `migratePendingMutation` can:
- **Transform args** — call `emit()` with modified input
- **Rename** — emit a different mutation name
- **Drop** — don't call `emit()`
- **Expand** — call `emit()` multiple times to produce several mutations from one

## Testing Migrations

Cover two things on every non-trivial migration: **data migration** end-to-end through the harness, and **pending-mutation replay** as a direct unit test.

### When migrations run

`migrateData` runs server-side as part of `runMutations` — i.e. when a client **pushes** a mutation. A pure pull does not trigger migrations; the server returns data tagged with whatever `schemaVersion` is currently stored. So a data-migration test must:

1. Seed an instance at the **old** `schemaVersion` with old-shape patches.
2. Open a client at the **new** `schemaVersion`.
3. Issue any mutation through the client to force the upgrade.
4. Assert the rewritten state.

Mock-based unit tests that fake the `ctx` object can pass while the migration silently misbehaves under the real backend (e.g. wrong shape passed to `ctx.table().set()`, mishandled `EntryKey` vs `string` for `itemKey`). Driving the migration through the real production code path catches these.

### `harness.seed.syncedStoreInstance(...)`

Both `createPoeTileTestHarness` (single-app) and `createPoeMultiTileTestHarness` (multi-app) expose `seed.syncedStoreInstance`. It bypasses authorize, mutators, hooks, and broadcasting — patches go directly into KV at the schema version you specify.

```typescript
await harness.seed.syncedStoreInstance({
  patches: [
    {
      op: "set",
      sortKey: "item/seeded",
      tableName: "items",
      itemKey: "todo-1",
      // Shape from a previous schema version — `migrateData` will rewrite it.
      value: {
        id: "todo-1",
        text: "old-shape todo",
        completed: false,
        order: 1, // dropped in v4
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ],
  schemaVersion: 3, // pre-migration version
});
```

Single-app harness defaults the instance to the harness's own `(storeTypeId, instanceId)`; the multi-app variant takes both as named arguments:

```typescript
await multiHarness.seed.syncedStoreInstance({
  storeTypeId: "todo-list",
  instanceId: "room-1",
  schemaVersion: 3,
  patches: [/* ... */],
});
```

The caller is responsible for ensuring `patches` are consistent with the seeded `schemaVersion` — there is no validation. If you seed nonsense, the migration will see nonsense.

### End-to-end data-migration test

```typescript
import { test, expect } from "bun:test";
import { createPoeMultiTileTestHarness } from "poe-tiles-sdk/v1/test-utils.js";
import { todoClientConfig, todoBackendConfig } from "@poe-tile/todo-list";

test("v3 → current migrates `order` to `sortKey`", async () => {
  const harness = createPoeMultiTileTestHarness({ backend: apiHarness });
  await harness.registerRootTile({
    typeId: "manager",
    clientConfig: managerClientConfig,
    backendConfig: managerBackendConfig,
  });
  await harness.registerTile({
    typeId: "todo-list",
    clientConfig: todoClientConfig,
    backendConfig: todoBackendConfig,
  });

  // 1. Seed at the old schema version, before any client connects.
  await harness.seed.syncedStoreInstance({
    storeTypeId: "todo-list",
    instanceId: "room-1",
    schemaVersion: 3,
    patches: [
      {
        op: "set",
        tableName: "items",
        itemKey: "v3-todo",
        value: {
          id: "v3-todo",
          text: "from v3",
          completed: false,
          order: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ],
  });

  // 2. Open a client at the current (newer) schema version.
  const root = harness.createRoot({ userId: "alice" });
  const child = await root.mountChild({
    typeId: "todo-list",
    clientConfig: todoClientConfig,
    instanceId: "room-1",
  });
  await child.poe.store.waitForServerData();

  // 3. Issue a mutation to drive the schema upgrade.
  const { confirmed } = await child.poe.store.mutate.setTodo({
    id: "trigger",
    text: "trigger migrations",
    completed: false,
    createdAt: 2,
    updatedAt: 2,
    sortKey: "item/trigger",
  });
  await confirmed;

  // 4. Assert the seeded row was rewritten by `migrateData`.
  const item = await child.poe.store.query((tx) =>
    tx.table("items").get("v3-todo"),
  );
  expect(item?.sortKey).toBeDefined(); // v3→v4 added `sortKey`
  expect(item?.text).toBe("from v3");

  harness.dispose();
});
```

### Patterns worth covering

When evolving schemas with non-trivial `migrateData`, write at least one test for each of:

- **Old → current chain.** Seed at the lowest schema version your app's data ever ran at and drive forward. Catches missing chain links, ordering bugs, and accumulated rewrites that only break across multiple steps.
- **Field rename / drop.** Seed with the old field name, assert the new field is set and the old one is gone (when the migration is meant to strip it).
- **Storage relocation.** If a `migrateData` step deletes from one storage `sortKey` and re-inserts at another (e.g. moving from default `""` to `"item/{uuid}"`), seed at the old storage location and assert the row is queryable at the new location after the migration.
- **Ordering preservation.** If the old shape carries an ordering field (e.g. numeric `order`) that the migration converts to a `sortKey`, seed several items out of insertion order and assert the post-migration `sortKey` ordering matches the original `order` ordering.
- **Idempotent skip.** Seed a row that already matches the new shape (e.g. has the new field, lacks the legacy field) at the old schema version. Assert the migration leaves it untouched.

### Pending-mutation replay

Each `migratePendingMutation` handler is a pure function from `(args, emit)` to emitted mutations. Call it directly with synthetic args and an `emit` spy — no harness needed:

```typescript
import { test, expect } from "bun:test";
import { migration1to2 } from "./migrations";

test("addTodo gains priority on replay", () => {
  const emitted: { name: string; args: unknown }[] = [];
  migration1to2.migratePendingMutation!.addTodo!(
    { id: "t1", text: "buy milk" },
    (name, args) => emitted.push({ name, args }),
  );
  expect(emitted).toEqual([
    { name: "addTodo", args: { id: "t1", text: "buy milk", priority: 0 } },
  ]);
});
```

Cover rename, drop (no `emit` call), and expand (multiple `emit` calls) the same way.

### Common pitfalls

- **`for (const [key, value] of entries)` — `key` is an `EntryKey`, not a string.** `ctx.table(...).scan().entries()` yields `[EntryKey, JSONValue]` where `EntryKey = { sortKey, itemKey }`. Both `set` and `delete` accept `string | EntryKey`, so the natural patterns are `set({ ...key, value })` and `delete(key)` — no manual extraction needed. Never cast with `key as unknown as string`: it bypasses the type system, and against older platform versions it stored `"[object Object]"` as the literal `itemKey` and corrupted the row.
- **Migrations don't run on pull.** A test that just opens a client and reads will see data at the **stored** `schemaVersion`, not the client's target. You must push a mutation to drive `runMutations` and the schema upgrade.
- **`migrateData` and the row's `value.sortKey` are not the same as the storage `sortKey`.** Some apps store a fractional-index `sortKey` inside the row's value (used for client-side ordering) **and** use a different sort key as the KV storage key (used for scan ordering). Be explicit about which one you mean; reread the schema before writing the migration's `set(...)` call.

### Reference

- `harness.seed.syncedStoreInstance(opts)` API:
  - `storeTypeId: string` (multi-app only) — the app whose instance you're seeding.
  - `instanceId: string` (multi-app only) — the instance to seed.
  - `schemaVersion?: number` — the version stored on KV after the seed. Migrations from this version forward will run on the next push. On the single-app harness this defaults to the app's current `schemaVersion` (seeded patches are presumed current-shape), so migration tests must pass the older version explicitly; on the multi-app harness an omitted version leaves the store uninitialized (version 0).
  - `codeVersionId?: string | null` — optional code-version pin.
  - `patches: Patch[]` — KV patches to write directly. Bypass authorize/mutators/hooks/broadcasting.
- `Patch` shape (from `@synced-store/shared/protocol`):
  ```typescript
  type PatchSet = {
    op: "set";
    tableName: string;
    itemKey: string;
    sortKey?: string;
    value: JSONValue;
  };
  type PatchDel = {
    op: "del";
    tableName: string;
    itemKey: string;
    sortKey?: string;
  };
  ```
