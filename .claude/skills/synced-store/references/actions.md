<!-- owner: jyoung-q -->
# Actions

Actions are server-only operations. Use them when you need things mutators can't do: AI calls, external APIs, randomness, or accessing server-only data.

| | Mutator | Action |
|---|---------|--------|
| Runs on | Client + Server | Server only |
| Instant UI update | Yes (optimistic) | No (waits for server) |
| Use when | Client has all data needed | Needs AI, external APIs, or server-only data |

## Declaring Actions in the Schema

```typescript
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

const schema = defineSchema({
  schemaVersion: TILE_SCHEMA_VERSION,
  tables: { /* ... */ },
  mutators: { /* ... */ },
  actions: {
    generateWithAI: {
      description: "Generate todo text from a prompt using AI",
      input: z.object({ id: z.string(), prompt: z.string() }),
      output: z.object({ text: z.string() }),
    },
  },
});
```

Actions are also exposed as MCP tools, so AI models can call them directly.

## Implementing Actions in the Backend Config

```typescript
export const todoBackendConfig = defineBackendConfig<typeof todoSchema>({
  schema: todoSchema,
  mutators: { /* ... */ },
  actions: {
    generateWithAI: async (ctx, input) => {
      const stream = await ctx.platform.call("poe.botStream.open", {
        botName: "GPT-4o-mini",
        queryRequest: {
          version: "1.0",
          type: "query",
          query: [{ role: "user", content: input.prompt }],
          user_id: "",
          conversation_id: crypto.randomUUID(),
          message_id: crypto.randomUUID(),
        },
      });

      const generatedText = await readBotStreamText(stream);
      await ctx.mutate("setTodo", {
        id: input.id,
        text: generatedText,
        status: "generating",
      });

      await ctx.mutate("setTodo", {
        id: input.id,
        text: generatedText,
        status: "ready",
      });

      return { text: generatedText };
    },
  },
});
```

## Calling Actions from the Client

```typescript
const result = await store.action.generateWithAI({
  id: "todo-1",
  prompt: "What should I cook for dinner?",
});
```

## Enqueuing Actions from Mutators

Mutators can trigger actions as a side effect. `ctx.enqueueAction()` is a no-op on the client; on the server it runs the action after the mutation commits. Call it unconditionally — no `ctx.isServer` guard needed.

```typescript
mutators: {
  createAndGenerate: async (ctx, input) => {
    // Instant: create a placeholder todo
    await ctx.table("todos").set({
      itemKey: input.id,
      value: { id: input.id, text: "Generating...", completed: false, status: "generating" },
    });

    // Queued: server will run this after the mutation commits
    ctx.enqueueAction("generateWithAI", {
      id: input.id,
      prompt: input.prompt,
    });
  },
},
```

## When NOT to use an Action

- Data changes that the client can compute — use a mutator (optimistic, no round trip).
- Secrets the client should never see — use `serverOnly()` tables; an action can expose a derived result.
