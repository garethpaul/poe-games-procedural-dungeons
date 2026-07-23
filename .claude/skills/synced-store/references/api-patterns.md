<!-- owner: jyoung-q -->
# Synced-Store API Patterns

## Table of Contents
- [Schema Definition](#schema-definition)
- [Mutator Context API](#mutator-context-api)
- [Client Config & Backend Config](#client-config--backend-config)
- [Entry Point Wiring](#entry-point-wiring)
- [Framework Bindings](#framework-bindings)
- [Package Conventions](#package-conventions)

## Schema Definition

Schema version lives in its own zero-dep file (`synced-store/tile-schema-version.ts`) so both `schema.ts` and `client-config.ts` can read it without importing Zod:

```typescript
// synced-store/tile-schema-version.ts
export const TILE_SCHEMA_VERSION = 1;
```

```typescript
import { z } from "zod";
import { defineSchema, singletonTable, table } from "poe-tiles-sdk/v1/backend.js";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

export const tileSchema = defineSchema({
  schemaVersion: TILE_SCHEMA_VERSION,
  tables: {
    game: {
      schema: table(z.object({
        id: z.string(),
        status: z.string(),
        createdAt: z.number(),
      })),
    },
    moves: {
      schema: table(z.object({
        id: z.string(),
        moveIndex: z.number(),
        playedBy: z.string(),
      })),
    },
  },
  mutators: {
    makeMove: {
      description: "Record a player move",
      input: z.object({ from: z.string(), to: z.string() }),
    },
    resetRound: {
      description: "Reset the round",
      input: z.object({}),
    },
  },
});
export type TileSchema = typeof tileSchema;
```

**Single-row tables**: Use `table(schema)` with a fixed itemKey like `"game"` for records that always have exactly one row (e.g., game state). To expose a typed settings bag where keys carry distinct value types, use `singletonTable(item(key, schema), ...)` — see [singleton-tables.md](singleton-tables.md). There is no no-key `singletonTable(schema)` form.

## Mutator Context API

```typescript
import type { InferMutatorHandlers, InferSchemaTableTypes } from "poe-tiles-sdk/v1/client.js";

export type TileTableTypes = InferSchemaTableTypes<TileSchema>;
export type RoundRecord = TileTableTypes["game"];

export const tileMutators: InferMutatorHandlers<TileSchema> = {
  makeMove: async (ctx, input) => {
    // READ a single record
    const game = await ctx.table("game").get("game"); // returns value | undefined

    // READ all entries
    const entries = await ctx.table("moves").entries().toArray(); // [key, value][]

    // WRITE a record — itemKey + value required
    await ctx.table("moves").set({
      itemKey: "move-1",
      value: { id: "move-1", moveIndex: 0, playedBy: ctx.userId },
    });

    // DELETE a record
    await ctx.table("moves").delete("move-1");

    // Current user
    const userId: string = ctx.userId;

    // Server check
    if (ctx.isServer) { /* server-only logic */ }
  },
};
```

## Shared Read Helpers

Use `InferReadContext<Schema>` for data-loading helpers that only read tables.
Those helpers can be reused from query callbacks, mutators, and actions without
deriving a context type from a specific handler.

```typescript
import type { InferReadContext, InferSchemaTableTypes } from "poe-tiles-sdk/v1/client.js";
import type { TileSchema } from "./schema";

export type TileTableTypes = InferSchemaTableTypes<TileSchema>;
export type RoundRecord = TileTableTypes["game"];
export type TileReadCtx = InferReadContext<TileSchema>;

export async function readRound(ctx: TileReadCtx): Promise<RoundRecord | undefined> {
  return (await ctx.table("game").get("game")) as RoundRecord | undefined;
}
```

Use `InferMutationContext<Schema>` only for helpers that need writes,
`enqueueAction`, or mutator-only fields. Use `InferActionContext<Schema>` for
helpers that need action-only fields such as `ctx.mutate`.

## Client Config & Backend Config

**Client** (`synced-store/client-config.ts`):
```typescript
import { defineClientConfig } from "poe-tiles-sdk/v1/client.js";
import type { tileSchema } from "./schema";        // type-only import!
import { tileMutators } from "./mutators/index";
import { tileHooks } from "./hooks";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

export const tileClientConfig = defineClientConfig<typeof tileSchema>({
  mutators: tileMutators,
  hooks: tileHooks,
  schemaVersion: TILE_SCHEMA_VERSION,
});
```

**Backend** (`synced-store/backend-config.ts`):
```typescript
import { defineBackendConfig } from "poe-tiles-sdk/v1/backend.js";
import { tileSchema } from "./schema";             // runtime import
import { tileMutators } from "./mutators/index";
import { tileHooks } from "./hooks";

export const tileBackendConfig = defineBackendConfig({
  schema: tileSchema,
  mutators: tileMutators,
  hooks: tileHooks,
  actions: {},
});
```

Every hook in `backend-config.ts` should also be wired in `client-config.ts`. The client only runs hook names it declares, and those optimistic hook runs are what make fresh prepared stores render hook-derived rows before the first server pull. Keep hook modules browser-safe; split or guard any server-only tail with `ctx.isServer`.

**Backend entry** (`tile/src/backend.ts`):
```typescript
import { tileBackendConfig } from "../../synced-store/backend-config";
export default tileBackendConfig;
```

## Entry Point Wiring

**Preact** (`tile/src/entry.tsx`):
```typescript
import { createPoe, PostMessageEnvironment } from "poe-tiles-sdk/v1/client.js";
import { render } from "preact";
import { tileClientConfig } from "../../client";
import { App } from "../../ui/App";

const environment = new PostMessageEnvironment();
const Poe = createPoe({ environment });
const store = Poe.setupStore(tileClientConfig);
render(<App store={store} />, document.getElementById("root")!);
```

**React**: Same pattern but use `createRoot(root).render(<App store={store} />)` and add `registerPoeTileElement(environment)`.

**SolidJS**: Same pattern but use `render(() => <App store={store} />, root)`.

## Framework Bindings

Two optional packages provide framework-specific hooks on top of the core store client:

### `poe-tiles-sdk/v1/react` — React hook

```typescript
import { useLiveQuery } from "poe-tiles-sdk/v1/react";

function MessageList({ store }: { store: TileStoreClient }) {
  const { data: messages, isLoading } = useLiveQuery(
    store,
    (tx) => tx.table("messages").entries().toArray(),
  );
  if (isLoading) return <div>Loading...</div>;
  return <ul>{messages.map(([, m]) => <li key={m.id}>{m.text}</li>)}</ul>;
}
```

- Returns `{ data: T | undefined, isLoading: boolean }`
- Resubscribes when `queryFn` reference changes; keeps previous data until new results arrive
- Accepts `null` for the store parameter (returns loading state)

### `poe-tiles-sdk/v1/solid` — SolidJS integration

Provides `subscribeToTable` on the store client for fine-grained reactivity:

```typescript
import "poe-tiles-sdk/v1/solid"; // augments the store client with subscribeToTable

const unsub = store.subscribeToTable("items", (entries, changes) => {
  // entries: full table snapshot as [[key, value], ...]
  // changes: { added: string[], modified: string[], removed: string[] }
});
```

Use with `createStore` + `reconcile()` to preserve DOM nodes across updates (see [ui-patterns.md](ui-patterns.md)).

**When to use which**: Most Poe tiles use `store.subscribe()` (built into the core client) directly. Use the framework bindings when you want `useLiveQuery`'s loading state management (React) or `subscribeToTable`'s change diffs (SolidJS animations).

## Package Conventions

```json
{
  "name": "@poe-tile/my-app",
  "version": "0.0.1",
  "type": "module",
  "dependencies": { "poe-tiles-sdk": "^1" },
  "scripts": {
    "build": "vite build",
    "test": "bun test tests/mutators.test.ts",
    "test:playwright": "bun run build && bunx playwright test",
    "lint": "biome lint --error-on-warnings .",
    "format:check": "biome format ."
  }
}
```

**Re-exports** (`client.ts`):
```typescript
import type { InferSyncedStoreClient } from "poe-tiles-sdk/v1/client.js";
import type { TileSchema } from "./synced-store/schema";

export type { TileSchema, tileSchema } from "./synced-store/schema"; // type-only!
export type TileStoreClient = InferSyncedStoreClient<TileSchema>;
export type { TileTableTypes } from "./synced-store/data/todos";
export { tileMutators } from "./synced-store/mutators/index";
export { tileClientConfig } from "./synced-store/client-config";
```
