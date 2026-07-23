<!-- owner: jyoung-q -->
# Platform Capabilities

Platform capabilities are server-side services available via `ctx.platform.call()`. They provide AI, blob storage, env vars, and cross-store calls.

Prefer platform calls in [actions](actions.md). Platform calls from mutators are discouraged: server mutators are processed one at a time, so slow platform calls block mutation throughput. Server mutation attempts can also be retried on optimistic-lock conflict before commit, so a direct mutator platform call can run more than once or for an attempt that is later discarded. If a mutator truly needs a short one-off platform effect, call it only on the server behind `if (ctx.isServer) { ... }`, `await` it before the mutator returns, and make the call idempotent/read-only. On the client, `ctx.platform.call(...)` always throws. If you need an AI call, slow external API, or non-idempotent effect triggered by a client interaction, use a mutator to create a placeholder, then `ctx.enqueueAction(...)` to do the server-only work.

## Available Services

| Service | Example | Description |
|---------|---------|-------------|
| `poe.botStream.open` | `call("poe.botStream.open", { botName, queryRequest })` | Open a trusted Poe Bot API stream without exposing API keys to app code |
| `systemTools.list` | `call("systemTools.list", {})` | List tools the LLM can call |
| `systemTools.call` | `call("systemTools.call", { toolName, toolInput })` | Execute a tool |
| `env.get` | `call("env.get", {})` | Get environment variables |
| `store.callAction` | `call("store.callAction", { storeTypeId, storeInstanceId, actionName, actionInput })` | Call an action on another store |
| `store.getSchema` | `call("store.getSchema", { storeTypeId })` | Get another store's schema |
| `blob.put` | `call("blob.put", { content: btoa("hello") })` | Store content (base64) |
| `blob.get` | `call("blob.get", { hash })` | Retrieve stored content |
| `blob.has` | `call("blob.has", { hash })` | Check if a blob exists |
| `tiles.publish` | `call("tiles.publish", { handle, html })` | Publish an app from inline HTML (`html` is the app's single-document source string) |
| `setSpaceTitle` | `call("setSpaceTitle", { title: "Alice vs Bob" })` | Set the user-facing title of the current app instance (`null` clears the rename). Fans out to every member's manager. |

## Usage in an Action

```typescript
import type { InferActionHandlers, PlatformCaller } from "poe-tiles-sdk/v1/backend.js";

type TodoActions = InferActionHandlers<typeof todoSchema, PlatformCaller>;

const actions: TodoActions = {
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
    await stream.cancel(); // parse the stream in real AI-driven actions
    const { hash } = await ctx.platform.call("blob.put", { content: btoa("cached result") });
    // ...
  },
};
```

Pass `PlatformCaller` as the second type parameter to `InferActionHandlers` for full autocomplete on `ctx.platform.call()`.

## Discouraged Mutator Usage

```typescript
import type { InferMutatorHandlers, PlatformCaller } from "poe-tiles-sdk/v1/backend.js";

type TodoMutators = InferMutatorHandlers<typeof todoSchema, PlatformCaller>;

const mutators: TodoMutators = {
  setSpaceTitleFromTodo: async (ctx, input) => {
    await ctx.table("todos").set({ itemKey: input.id, value: input.todo });
    if (!ctx.isServer) return;
    await ctx.platform.call("setSpaceTitle", { title: input.todo.text });
  },
};
```

Only use this discouraged pattern for short, one-off server-side effects that must be part of the mutator flow. Always `await ctx.platform.call(...)` before the mutator returns. The call must be idempotent/read-only because optimistic-lock conflicts can retry the server mutator attempt and rerun direct platform calls before any commit succeeds. Do not put AI calls, streaming, slow HTTP requests, high-fanout work, or non-idempotent side effects directly in mutators.

## Testing

```typescript
import { createMockPlatformCaller } from "poe-tiles-sdk/v1/test-utils.js";

// Unit tests
const runner = createLocalStoreFunctionRunner({
  ...myBackendConfig,
  createPlatformCaller: () => createMockPlatformCaller(),
});

// E2E tests
const server = new TestServer({
  createPlatformCaller: () => createMockPlatformCaller(),
});
```
