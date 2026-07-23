<!-- owner: jyoung-q -->
# Backend API

The `poe-tiles-sdk/v1/backend.js` module is the single import for everything a Poe tile needs on the backend side. It wraps `@synced-store/backend` with Poe-specific defaults — system tables and hooks are pre-wired so apps don't configure them manually.

```typescript
import {
  defineSchema, table, singletonTable, item,
  defineBackendConfig,
} from "poe-tiles-sdk/v1/backend.js";
```

## Schema Builders

### `defineSchema()`

Define a synced-store schema with Poe system tables automatically configured. System tables (`$users`, `$userInfo`) are pre-wired — no need to pass `systemTableTypes`.

```typescript
import { defineSchema, table } from "poe-tiles-sdk/v1/backend.js";
import { z } from "zod";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

export const mySchema = defineSchema({
  schemaVersion: TILE_SCHEMA_VERSION,
  tables: {
    messages: {
      schema: table(z.object({
        text: z.string(),
        sender: z.string(),
      })),
    },
  },
  mutators: {
    send: {
      description: "Send a message",
      input: z.object({ text: z.string() }),
    },
  },
  actions: {
    summarize: {
      description: "Summarize the conversation with AI",
      input: z.object({}),
    },
  },
});
```

### `table(schema)`

Define a homogeneous table where every row has the same Zod schema.

### `singletonTable(items)`

Define a singleton table with a fixed set of typed keys.

```typescript
import { singletonTable, item } from "poe-tiles-sdk/v1/backend.js";
import { z } from "zod";

const settings = singletonTable({
  theme: item(z.enum(["light", "dark"])),
  language: item(z.string()),
});
```

### `item(schema)`

Define a single item within a `singletonTable`.

## `defineBackendConfig()`

Bundle your schema, mutators, actions, and hooks into a typed backend config. Hook names (`onInit`, `onAddUsers`, `onRemoveUser`, `onAnonymizeUser`, `onSetTitle`, `onGrantPermission`, `onRevokePermission`, `onAddTileInstanceToRoom`, `onChangeTileParent`, `onAddChildTile`, `onChildInstancesAdded`, `onRoomMemberInstanceMovedOut`) are pre-wired with their input types.

Every backend hook should also be represented in `defineClientConfig({ hooks })` so `poe-tiles-kernel` can supply matching optimistic startup invocations when opening a fresh prepared store. Put deterministic hook work in a browser-safe shared helper and import that helper into both configs. Keep only truly server-only effects backend-local, or guard them with `if (ctx.isServer)`.

```typescript
import { defineBackendConfig } from "poe-tiles-sdk/v1/backend.js";
import { mySchema } from "./schema";
import { myMutators } from "./mutators/index";
import { myActions } from "./actions";

export const myBackendConfig = defineBackendConfig({
  schema: mySchema,
  mutators: myMutators,
  actions: myActions,
  hooks: {
    onAddUsers: async (ctx, { userId }) => {
      // Initialize user data when they join
    },
    onRemoveUser: async (ctx, { userId }) => {
      // Clean up when a user leaves
    },
  },
});
```

### System Hooks

| Hook | Input | When it fires |
|------|-------|---------------|
| `onInit` | `{ parentRoomUsers }` | A new child-room tile is initialized with parent-room context (`parentRoomUsers` is a read-only roster snapshot) |
| `onAddUsers` | `{ userId: string }` | User joins the store instance |
| `onRemoveUser` | `{ userId: string }` | User leaves the store instance |
| `onAnonymizeUser` | `{ userId: string }` | User is hard-deleted/anonymized |
| `onSetTitle` | `{ userId: string; title: string \| null }` | Store title changes; `title` is `null` when the custom title is cleared/reset to the default — handle the reset case rather than interpolating `null` |
| `onGrantPermission` | `{ userId: string; permission: string }` | Permission granted |
| `onRevokePermission` | `{ userId: string; permission: string }` | Permission revoked |
| `onAddTileInstanceToRoom` | `{ storeTypeId: string; instanceId: string }` | A new app instance is registered as a member of this room (fires on the room store after a new `$room_member_instances` row is written; suppressed on idempotent re-registers) |
| `onChangeTileParent` | `{ previousParent?: PoeTileRoom; parent?: PoeTileRoom }` | This tile instance gains, loses, or changes its parent rootGroup |
| `onAddChildTile` | `{ typeId: string; instanceId: string; room: PoeTileRoom; reason?: "adoption" }` | A rootGroup gains one net-new child tile row |
| `onChildInstancesAdded` | `{ instances: Array<{ typeId: string; instanceId: string; roomTypeId: string; roomId: string; reason?: "adoption" }> }` | A rootGroup gains one or more net-new child tile rows |
| `onRoomMemberInstanceMovedOut` | `{ storeTypeId, instanceId, toRoom, ... }` | A member app instance is removed from this room |

Common hook uses:

- `onInit` is for deterministic one-time bootstrap. Use it to seed app-owned rows such as an initial activity message (`"{name} started the group"`). `parentRoomUsers` is a read-only snapshot of the parent room's roster — never a way to admit members. Membership is platform-owned: the host seats the launcher at genesis (both users when the tile is launched from a 2-person room, i.e. a DM); larger rooms stay picker-driven.
- `onAddUsers` runs after the membership row is written. Use it to auto-seat newly added users into app-local roles, seats, teams, or turns, and to append membership activity. To log who added whom, read `await ctx.table("$users").get(userId)` for `addedBy` / `addedBatchUserIds`, then read `$userInfo` for display names and write a message such as `"{name} added {usernames...}"`.

## System Tables

These tables are automatically available in mutators and actions via `ctx.table()`:

| Table | Type | Description |
|-------|------|-------------|
| `$users` | `UserMembership` | Users currently in the store instance |
| `$userInfo` | `PoeUserInfo` | Profile information for each user |

```typescript
// In a mutator or action:
const user = await ctx.table("$users").get(userId);
const info = await ctx.table("$userInfo").get(userId);
```

## Platform Capabilities

Actions and guarded server-side mutator code have access to server-side services via `ctx.platform.call()` — AI streaming, blob storage, environment variables, and more. Prefer actions; mutator platform calls are discouraged, must be awaited, must be idempotent/read-only because optimistic-lock conflicts can retry the server mutator attempt, and should be rare because mutators are processed one at a time. See [Platform](../../synced-store/references/platform.md) for the full guidance.

```typescript
const actions = {
  summarize: async (ctx, input) => {
    const stream = await ctx.platform.call("poe.botStream.open", {
      botName: "GPT-4o-mini",
      queryRequest: input.queryRequest,
    });
    await stream.cancel(); // parse the stream in real actions
    const { hash } = await ctx.platform.call("blob.put", { content: btoa("result") });
  },
};
```

### Server-side bot calls (`stream` / `call`)

For bot calls from actions, prefer the high-level helpers over parsing `poe.botStream.open` by hand. They mirror the client's `Poe.stream()` / `Poe.call()` but run server-side, so prompts, fallback data, and results never enter the client bundle:

```typescript
import {
  createPoeBotStreamResponseFetcher,
  stream,
} from "poe-tiles-sdk/v1/backend.js";

const actions = {
  generateQuestions: async (ctx, input) => {
    const botResponseFetcher = createPoeBotStreamResponseFetcher(ctx.platform);
    let text = "";
    for await (const partial of stream({
      botName: "Claude-Sonnet-4.6",
      prompts: [{ role: "user", text: "Five trivia questions about space." }],
      botResponseFetcher,
    })) {
      text = partial.isReplaceResponse ? partial.text : text + partial.text;
    }
    // ...validate and write results via tables
  },
};
```

`call` is the agentic variant (tool-execution loop). Types: `BotResponseFetcher`, `Message`, `PartialResponse`, `ExecutableTool` — all from `poe-tiles-sdk/v1/backend.js`. Bot calls belong in **actions**, not mutators (mutators must stay deterministic).

## Type Exports

### Type Inference Utilities

```typescript
import type {
  InferActionContext,       // Action context type from schema
  InferActionHandlers,      // Action handler types from schema
  InferMutationContext,     // Mutation context type from schema
  InferMutatorHandlers,     // Mutator handler types from schema
  InferReadContext,         // Read-only context type from schema
  InferSchemaTableTypes,    // Table types from schema
  InferSchemaActionSchemas, // Action input schemas from schema
  InferSchemaMutatorSchemas,// Mutator input schemas from schema
} from "poe-tiles-sdk/v1/backend.js";
```

### Core Types

```typescript
import type {
  ActionContext, ActionFn,      // Server-side action context
  MutationContext, MutationFn,  // Shared mutation context (client + server)
  QueryContext, QueryFn,        // Query context
  JSONValue,                    // JSON-serializable value
  ScanResult,                   // Table scan result
  TableReader, TableWriter,     // Table operation interfaces
} from "poe-tiles-sdk/v1/backend.js";
```

### Poe Platform Types

```typescript
import type {
  PlatformCaller,    // Type for ctx.platform.call()
  PlatformAPI,       // Platform capability types
  PlatformAPIName,   // Platform capability names
  SystemHookMap,     // Typed hook definitions
  SystemTableTypes,  // System table type map
  PoeUserInfo,       // User profile data
  UserMembership,    // User membership record
} from "poe-tiles-sdk/v1/backend.js";
```

### Migration Types

```typescript
import type {
  AnyMigration,  // Single migration step
  Migrations,    // Array of migrations for schema versioning
} from "poe-tiles-sdk/v1/backend.js";
```
