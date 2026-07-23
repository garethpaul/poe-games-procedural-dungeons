<!-- owner: jyoung-q -->
# SyncedStore Quick Reference

How the client and backend configs connect to give you a fully typed synced-store app.

## The Two Configs

Every bundled app has two configs — one for the client (runs in the browser) and one for the backend (runs on the server). Both are derived from the same schema.

```
schema.ts ──→ defineBackendConfig() ──→ backend-config.ts (server)
    │
    └──────→ defineClientConfig()   ──→ client-config.ts  (browser)
```

### `defineBackendConfig()` — Server Side

Import from [`poe-tiles-sdk/v1/backend.js`](./backend-api). Bundles schema + mutators + actions + hooks. Poe system tables and hooks are auto-wired.

```typescript
import { defineSchema, table, defineBackendConfig } from "poe-tiles-sdk/v1/backend.js";
import { z } from "zod";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

const schema = defineSchema({
  schemaVersion: TILE_SCHEMA_VERSION,
  tables: { items: { schema: table(z.object({ text: z.string() })) } },
  mutators: { addItem: { input: z.object({ text: z.string() }) } },
  actions: {},
});

export const backendConfig = defineBackendConfig({
  schema,
  mutators: { addItem: async (ctx, input) => { /* ... */ } },
  actions: {},
});
```

### `defineClientConfig()` — Client Side

Import from [`poe-tiles-sdk/v1/client.js`](./client-api.md). Bundles mutators and client-safe system hooks (no schema or Zod at runtime). Use a **type-only** import of the schema to get full type inference without bundling Zod (~280KB).

```typescript
import { defineClientConfig } from "poe-tiles-sdk/v1/client.js";
import type { schema } from "./schema";  // type-only!
import { myMutators } from "./mutators/index";
import { myClientHooks } from "./hooks";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

export const clientConfig = defineClientConfig<typeof schema>({
  mutators: myMutators,
  hooks: myClientHooks,
  schemaVersion: TILE_SCHEMA_VERSION,
});
```

Register every hook that the backend declares here too. `poe-tiles-kernel` only supplies optimistic startup invocations for hook names that the app exposes in its client config. If a hook has server-only effects, export a shared deterministic helper for the client and backend configs, then keep the server-only tail in `backend-config.ts` or behind `if (ctx.isServer)`.

Both sides read `TILE_SCHEMA_VERSION` from a single zero-dep file (`synced-store/tile-schema-version.ts`) so the version can never drift between client and server.

Then in your app entry:

```typescript
import { createPoe, PostMessageEnvironment } from "poe-tiles-sdk/v1/client.js";

const Poe = createPoe({ environment: new PostMessageEnvironment() });
const store = Poe.setupStore(clientConfig);
```

## System Tables

Poe tiles automatically get three system tables, accessible via `ctx.table()` in mutators and actions:

| Table | Type | Description |
|-------|------|-------------|
| `$users` | `UserMembership` | Members of the store instance |
| `$userInfo` | `PoeUserInfo` | Profile info (name, avatar, etc.) |

```typescript
// Read system tables like any other table
const members = await ctx.table("$users").entries().toArray();
const myInfo = await ctx.table("$userInfo").get(userId);
```

These are managed by the platform — your app reads them but doesn't write to them directly. User lifecycle events are handled via [system hooks](./backend-api.md#system-hooks).

## Further Reading

- [API Patterns](../../synced-store/references/api-patterns.md) — Schema, mutators, configs, entry wiring
- [Mutator Rules](../../synced-store/references/mutator-rules.md) — Toggle-free writes, external IDs, read-before-write
- [Actions](../../synced-store/references/actions.md) — Server-only operations (AI, external APIs)
- [Client API Reference](../../synced-store/references/client-api-reference.md) — `SyncedStoreClient` API (query, subscribe, mutate)
- [Platform](../../synced-store/references/platform.md) — Server-side capabilities in actions
