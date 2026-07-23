<!-- owner: jyoung-q -->
# Schema Libraries

Synced-store uses any [Standard Schema](https://github.com/standard-schema/standard-schema)-compliant library (Zod, Valibot, ArkType) or plain JSON Schema. Schemas are used for **compile-time type inference only** — no runtime validation.

Zod is the default in most examples. When you need to avoid Zod's bundle size or prefer a different style, use one of these.

## Valibot

```typescript
import * as v from "valibot";
import { defineSchema, table } from "poe-tiles-sdk/v1/backend.js";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

const schema = defineSchema({
  schemaVersion: TILE_SCHEMA_VERSION,
  tables: {
    todos: { schema: table(v.object({ text: v.string(), done: v.boolean() })) },
  },
  mutators: {
    setTodo: { description: "...", input: v.object({ id: v.string(), text: v.string() }) },
  },
});
```

## JSON Schema (no library needed)

Useful when you don't want to pull in a validation library, or when the schema is already expressed as JSON Schema elsewhere.

```typescript
import { jsonSchema } from "poe-tiles-sdk/v1/backend.js";
import { defineSchema, table } from "poe-tiles-sdk/v1/backend.js";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

const schema = defineSchema({
  schemaVersion: TILE_SCHEMA_VERSION,
  tables: {
    todos: {
      schema: table(jsonSchema<{ text: string; done: boolean }>({
        type: "object",
        properties: {
          text: { type: "string" },
          done: { type: "boolean" },
        },
        required: ["text", "done"],
      })),
    },
  },
});
```

The TypeScript generic on `jsonSchema<T>()` is the source of truth for types. The JSON Schema object itself is carried through for tooling (e.g. MCP tool definitions).

## When to pick which

- **Zod** — the default; richest ecosystem and best error messages. Costs ~280KB gzipped on the client if bundled — use type-only imports in `client-config.ts` to avoid this.
- **Valibot** — tree-shakable, much smaller bundle; same mental model as Zod.
- **JSON Schema** — zero runtime dependency; use when you want the schema to be consumed by external tools (or when the schema is hand-written elsewhere).
