<!-- owner: jyoung-q -->
# Singleton Tables

`singletonTable()` defines a table whose keys are statically known and each has its own type. Use it for typed app settings, config, or any table where the set of keys is fixed.

This differs from `table()` (collection of same-shape values, dynamic keys) and from the "singleton row" usage of `table()` (one row under a fixed key).

## Typed-Key Form

Each call to `item(key, schema)` declares one key and its value type:

```typescript
import { defineSchema, singletonTable, item } from "poe-tiles-sdk/v1/backend.js";
import { z } from "zod";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

const schema = defineSchema({
  schemaVersion: TILE_SCHEMA_VERSION,
  tables: {
    settings: {
      schema: singletonTable(
        item("theme", z.enum(["light", "dark"])),
        item("itemsPerPage", z.number()),
      ),
    },
  },
  mutators: { /* ... */ },
});

// Reads are type-narrowed per key:
await ctx.table("settings").get("theme");      // "light" | "dark" | undefined
await ctx.table("settings").get("itemsPerPage"); // number | undefined
await ctx.table("settings").get("invalid");    // TYPE ERROR — unknown key
```

## Single-Row Form

For a single logical record (e.g. a game-state row), use `table(valueSchema)` with a fixed itemKey:

```typescript
import { z } from "zod";
import { defineSchema, table } from "poe-tiles-sdk/v1/backend.js";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

const schema = defineSchema({
  schemaVersion: TILE_SCHEMA_VERSION,
  tables: {
    game: { schema: table(z.object({ status: z.string(), turn: z.number() })) },
  },
});

await ctx.table("game").get("game");
await ctx.table("game").set({ itemKey: "game", value: { status: "active", turn: 1 } });
```

`singletonTable()` only accepts `item(key, schema)` arguments — there is no no-key form that takes a raw schema.

## When to Use Which

- **Collection of items** (todos, moves, messages): `table(valueSchema)` — keys are dynamic strings.
- **Typed settings bag** (per-key types differ): `singletonTable(item(...), item(...), ...)`.
- **Single logical record** with one shape: `table(valueSchema)` with a fixed itemKey like `"game"`.
