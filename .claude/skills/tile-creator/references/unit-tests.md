<!-- owner: jyoung-q -->
# Unit Tests

This guide explains how to test Poe tiles using `createPoeTileTestHarness`. The harness creates multi-client test scenarios using the child app architecture — each `createClient()` call exercises the full production code path (AppsKernel → HostKernelRpc → nonce routing → PostMessageEnvironment → createPoe).

## Basic Setup — Store Tests

```typescript
import { test, expect } from "bun:test";
import { createPoeTileTestHarness } from "poe-tiles-sdk/v1/test-utils.js";
import { myBackendConfig } from "./synced-store/backend-config";
import type { MySchema } from "./synced-store/schema";

test("mutation round-trip", async () => {
  const harness = createPoeTileTestHarness<MySchema>({
    store: { backendConfig: myBackendConfig },
  });
  const { store } = await harness.createClient({ userId: "alice" });

  const { confirmed } = await store.mutate.setValue({
    key: "greeting",
    value: "hello",
  });
  await confirmed;

  const result = await store.query((tx) => tx.table("data").get("greeting"));
  expect(result).toBe("hello");

  harness.dispose();
});
```

`createClient()` returns `{ Poe, store, dispose }` where `Poe` is the full production API and `store` is the typed SyncedStoreClient (already synced with server data).

## Basic Setup — Bot Streaming Tests

```typescript
import { test, expect } from "bun:test";
import {
  createPoeTileTestHarness,
  textResponses,
} from "poe-tiles-sdk/v1/test-utils.js";

test("stream bot response", async () => {
  const harness = createPoeTileTestHarness({
    getBotResponse: textResponses(["Hello ", "World!"]),
  });
  const { Poe } = await harness.createClient();

  const chunks = [];
  for await (const chunk of Poe.stream({
    botName: "Claude-3.5-Sonnet",
    prompts: "Hi",
  })) {
    chunks.push(chunk);
  }

  expect(chunks).toHaveLength(2);
  expect(chunks[0].text).toBe("Hello ");
  expect(chunks[1].text).toBe("World!");

  harness.dispose();
});
```

## Multi-Client Testing

Multiple clients can share the same store instance.

### Simple case: second client created after the first mutation

```typescript
test("multi-user sync", async () => {
  const harness = createPoeTileTestHarness<MySchema>({
    store: { backendConfig: myBackendConfig },
  });

  const alice = await harness.createClient({ userId: "alice" });
  await alice.store.mutate.setValue({ key: "k1", value: "from alice" });

  // bob's bootstrap pull picks up alice's mutation automatically.
  const bob = await harness.createClient({ userId: "bob" });
  const result = await bob.store.query((tx) => tx.table("data").get("k1"));
  expect(result).toBe("from alice");

  harness.dispose();
});
```

### Pre-existing clients with sequential mutations: use `waitFor*`

If both clients exist *before* the mutations and you need them to observe each other's state in order, the second client's optimistic pass races the first client's server confirmation. Use one of the `waitFor*` helpers from `poe-tiles-sdk/v1/test-utils.js` to gate on the propagated state:

| Helper | Use when |
|---|---|
| `waitForKeyExists(client, { table, key })` | A row needs to appear before the next step |
| `waitForValue(client, { table, key, value })` | A row needs to deep-equal a specific value |
| `waitForKeyMatch(client, { table, key, match })` | A row needs to satisfy a predicate (most flexible) |
| `waitForKeyDeleted(client, { table, key })` | A row needs to disappear |
| `waitForAllClients([...], { queryFn })` | Multiple clients need to converge to the same truthy state |
| `waitFor(client, { queryFn })` | A general query needs to return truthy |

Each takes an optional `{ timeoutMs, description }` and emits a descriptive timeout error on failure. Source: `packages/synced-store-client/test-utils/wait-for.ts`.

For `waitFor` / `waitForAllClients`, the `queryFn` shape is the same as `store.query` / `store.subscribe`: pass `(tx) => tx.table(...).get(...)`, not a helper that expects the store/client object. The key/value wait helpers use `{ table, key, ... }` options instead. If you have a reusable read helper, type it to accept a read context (`InferReadContext<TileSchema>`) so it can be called from queries, subscribes, mutators, and query-based wait helpers.

```typescript
import {
  createPoeTileTestHarness,
  waitForKeyExists,
  waitForKeyMatch,
} from "poe-tiles-sdk/v1/test-utils.js";

test("two pre-existing clients merge edits", async () => {
  const harness = createPoeTileTestHarness<MySchema>({
    store: { backendConfig: myBackendConfig },
  });

  const { store: alice } = await harness.createClient({ userId: "alice" });
  const { store: bob } = await harness.createClient({ userId: "bob" });

  await alice.mutate.setTodo({ id: "t1", text: "Buy milk", completed: false });

  await waitForKeyExists(bob, { table: "items", key: "t1" });

  await bob.mutate.setTodo({ id: "t1", completed: true });

  await waitForKeyMatch(alice, {
    table: "items",
    key: "t1",
    match: (t) => (t as { completed: boolean }).completed === true,
  });

  expect(await alice.query((tx) => tx.table("items").get("t1"))).toMatchObject({
    text: "Buy milk",
    completed: true,
    createdBy: "alice",
  });

  harness.dispose();
});
```

Don't hand-roll a `await { confirmed } = mutate.X(); await confirmed; await waitForServerData()` pattern — it lacks the timeout/description infrastructure these helpers provide, and the pattern doesn't generalize to predicate-based waits.

### Happy-dom UI tests: never `setTimeout(resolve, N)` to wait for propagation

Don't paper over UI propagation timing with a hardcoded `await new Promise(r => setTimeout(r, 50))` — slow CI, GC pauses, or any scheduler hiccup turns a 50ms cushion into a flake. Bundles also lint-fail on `setTimeout` in tests.

Use `waitFor*` from `poe-tiles-sdk/v1/test-utils.js`. **`waitFor*` is subscription-based, not polling-based** — internally it does both a `client.subscribe(queryFn, ...)` AND an immediate `client.query(queryFn)` so the predicate gets a synchronous first look at current state. There's still a UI-side gotcha to know about:

- **Subscribe's "initial fire" is async (microtask), not synchronous.** `mountApp(root, store)` returns before its registered subscribe has invoked its callback. If the data the UI needs is already in the store, `waitFor`'s immediate `client.query` can resolve `waitFor` before `mountApp`'s subscribe callback has had a chance to update the DOM. Asserting on the DOM right after `await waitFor(...)` then races.
- **Fix: force a real store change after mounting** so both subscribes fire in order. Issue a no-op mutation, then `waitFor` on a predicate that combines store state AND the DOM. Total wait is bounded by the mutation roundtrip — no `setTimeout`.

```typescript
import { waitFor } from "poe-tiles-sdk/v1/test-utils.js";

const root = document.createElement("div");
mountApp(root, store);

// Force a store change so mountApp's subscribe fires AFTER the test's
// subscribe is set up. Pick any cheap mutation already in your schema
// (e.g. re-record the current score) — the goal is propagation, not a
// real state change.
await (await store.mutate.someCheapMutation({})).confirmed;

await waitFor(store, {
  queryFn: async (tx) => {
    const row = (await tx.table("players").get("alice")) as
      | { bestScore: number }
      | undefined;
    return (
      row?.bestScore === 11 &&
      root.querySelector("#best")?.textContent === "11"
    );
  },
  description: "HUD #best to reflect alice's bestScore=11",
});
```

If your app has no convenient cheap mutation, add one — the cost is one mutation per UI test, the gain is a bounded, deterministic wait.

### Vitest browser mode: when happy-dom can't fake the web API

happy-dom is fine for DOM, layout, and timers, but it has no WebGL, no `OffscreenCanvas`, no `AudioWorklet`, and other web APIs that the in-memory harness can't reliably stub. For those, run the same UI flow in real Chromium via Vitest browser mode and connect each client to a real `TestServer` (HTTP + WebSocket) via `createPoeTileBrowserTestHarness`.

```typescript
// vitest.browser.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["ui/**/*.test.browser.{ts,tsx}"],
    globalSetup: ["./tests/global-setup.browser.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      instances: [{ browser: "chromium" }],
      headless: true,
    },
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["lcov"],
      reportsDirectory: "./coverage/browser",
    },
  },
});
```

```typescript
// tests/global-setup.browser.ts — starts TestServer once, exposes ports
import { TestServer } from "poe-tiles-sdk/v1/test-utils/playwright.js";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    syncPort: number;
    tileTypeId: string;
  }
}

export default async function setup(project: TestProject) {
  const server = new TestServer();
  await server.start();
  await server.registerTile({
    typeId: "my-app",
    content: { type: "directory", dir: "./dist" },
  });
  project.provide("syncPort", server.syncPort);
  project.provide("tileTypeId", "my-app");
  return () => server.close();
}
```

```typescript
// ui/App.test.browser.tsx
import { afterEach, beforeEach, describe, expect, test, inject } from "vitest";
import { createPoeTileBrowserTestHarness } from "poe-tiles-sdk/v1/test-utils/browser.js";
import { tileMutators } from "../client";
import { mountApp } from "./App";

describe("real WebGL", () => {
  let harness: ReturnType<typeof createPoeTileBrowserTestHarness>;
  beforeEach(() => {
    harness = createPoeTileBrowserTestHarness({
      storeTypeId: inject("tileTypeId"),
      instanceId: `test-${crypto.randomUUID()}`,
      syncWsUrl: `ws://localhost:${inject("syncPort")}`,
      mutators: tileMutators,
      schemaVersion: 1, // match your app's schemaVersion
    });
  });
  afterEach(() => harness.dispose());

  test("renders scene graph", async () => {
    const { store } = await harness.createClient({ userId: "alice" });
    const root = document.createElement("div");
    document.body.appendChild(root);
    const game = mountApp(root, store);
    // Drive store.mutate / store.query, assert against scene-graph debug, etc.
    game?.stop();
  });
});
```

When to reach for it:
- Real WebGL / Three.js scene-graph assertions (happy-dom returns `null` from `getContext("webgl")`).
- Audio / `OffscreenCanvas` / clipboard / pointer-capture flows.
- Anywhere a fake DOM diverges from real browser behavior in a way that hides bugs.

Otherwise prefer the in-memory + happy-dom harness — it runs in ~50 ms per test vs ~1.5 s for browser mode. Only use browser-mode coverage where the real API is the point. Add new browser tests under `*.test.browser.tsx` so they don't run under `bun test`. See `e2e-tests.md` for the `TestServer` API reference.

## Response Helpers

The harness provides convenience helpers for common bot response patterns:

| Helper | Description |
|--------|-------------|
| `textResponse("Hello")` | Single text event |
| `textResponses(["a", "b"])` | Multiple text events |
| `sseResponses([...])` | Raw SSEEvent array |
| `sequentialResponses([[...], [...]])` | Different responses per call |
| `errorResponse("msg")` | Throws an error |

### Custom Response Handler

For full control, pass an async generator that receives the request params:

```typescript
const harness = createPoeTileTestHarness({
  getBotResponse: async function* (params) {
    if (params.botName === "Claude") {
      yield { event: "text", data: { text: "I'm Claude" } };
    } else {
      yield { event: "error", data: { text: "Unknown bot" } };
    }
  },
});
```

### Sequential Responses (Tool Loops)

`sequentialResponses` is useful for testing `Poe.call()` with tools, where the bot makes a tool call on the first request and gives a final answer on the second:

```typescript
import { sequentialResponses } from "poe-tiles-sdk/v1/test-utils.js";

test("tool call loop", async () => {
  const harness = createPoeTileTestHarness({
    getBotResponse: sequentialResponses([
      // First call: bot requests a tool
      [
        {
          event: "json",
          data: {
            choices: [{
              delta: {
                tool_calls: [{
                  id: "call_1",
                  function: {
                    name: "get_weather",
                    arguments: '{"city":"Tokyo"}',
                  },
                }],
              },
            }],
          },
        },
      ],
      // Second call: bot gives final answer
      [{ event: "text", data: { text: "It's sunny in Tokyo!" } }],
    ]),
  });
  const { Poe } = await harness.createClient();

  const weatherTool = Poe.createTool({
    name: "get_weather",
    description: "Get weather",
    parameters: {
      type: "object",
      properties: { city: { type: "string" } },
    },
    run: async (input) => `Weather in ${input.city}: 72F sunny`,
  });

  const events = [];
  for await (const event of Poe.call({
    botName: "bot",
    prompts: "What's the weather in Tokyo?",
    tools: [weatherTool],
  })) {
    events.push(event);
  }

  expect(events.filter((e) => e.type === "tool_call")).toHaveLength(1);
  expect(events.filter((e) => e.type === "tool_result")).toHaveLength(1);
});
```

## Request Capture

Every bot query, model list, and app list request is captured in `harness.requests`:

```typescript
for await (const _ of Poe.stream({ botName: "bot", prompts: "Hi" })) {}

expect(harness.requests).toHaveLength(1);
expect(harness.getRequests("getBotResponse")).toHaveLength(1);
```

## Testing UI actions that call host RPCs (openProfile, pickMembers, tileEnd, ...)

For host-navigation calls like `Poe.users.openProfile()`, `Poe.room.pickMembers()`, or `Poe.room.tileEnd()`, pass the client's real `Poe` object into your component instead of hand-writing a fake `poe` prop object. `createClient()`'s `Poe` routes through the full production path (AppsKernel → HostKernelRpc → your app), so it enforces the same request-shape validation and host-side behavior the real host enforces — for example `users.openProfile` requires a `userId` and the host silently drops an open it can't route. A hand-rolled stub like `{ users: { openProfile: async () => {} } }` accepts anything, including payloads the real host would reject or drop, which can hide real bugs (a profile button that dispatches an unroutable open shows a broken "profile unavailable" state in production, but a loose stub happily "succeeds" in the test):

```typescript
test("tapping a player's avatar opens their profile", async () => {
  const harness = createPoeTileTestHarness({ store: { backendConfig } });
  const { Poe, store } = await harness.createClient({ userId: "alice" });
  const { container } = render(() => <App store={store} poe={Poe} />);

  (container.querySelector('[data-testid="profile-bob"]') as HTMLButtonElement).click();

  await waitFor(() => harness.getRequests("users.openProfile").length === 1);
  // Keyed on `userId` — the host resolves the profile from it.
  expect(harness.getRequests("users.openProfile")[0].params).toEqual({
    userId: "bob",
  });
});
```

Only reach for a hand-written `poe` fake when you need a return value the harness can't produce (e.g. simulating a rejected promise to test error handling) — and even then, prefer wrapping the real `Poe` object (`{ ...Poe, users: { ...Poe.users, openProfile: async () => { throw new Error(...) } } }`) so every other call still goes through the validated path.

## Cross-App Testing with `otherStores`

Use `otherStores` to register additional store backends for cross-app testing. Each key is a `storeTypeId`. In your app code, call `Poe.externalStore({ storeTypeId, instanceId })` to get a read-only handle for querying another store's data:

```typescript
test("read from external store", async () => {
  const harness = createPoeTileTestHarness({
    store: {
      storeTypeId: "chat",
      backendConfig: { mutators: chatMutators },
    },
    otherStores: {
      manager: {
        backendConfig: { mutators: managerMutators },
      },
    },
  });
  const { Poe, store } = await harness.createClient();

  // Mutations can trigger ctx.mutateExternal() to write to other stores
  await store.mutate.sendMessage({ id: "msg-1", text: "hello" });

  // Read from the external store
  const external = Poe.externalStore({
    storeTypeId: "manager",
    instanceId: "test-instance",
  });
  await external.waitForBootstrap();
  // Query the external store's data (read-only). For private rows, use
  // external.privateOfUser(userId).table("prefs").get("current").

  harness.dispose();
});
```

## Controlled Flush (Cache Testing)

Use `createControlledClient()` to control when server data arrives — useful for testing cached data behavior:

```typescript
const { store, transport } = await harness.createControlledClient();

// Store is set up but NOT synced — server data hasn't arrived
// Do assertions on cached/empty state here...

// Now flush to let server data through
await transport.flushUntil(store.waitForServerData());

// Server data has arrived
```

## Swapping Handlers Mid-Test

All handlers can be replaced at any point:

```typescript
harness.setBotResponseHandler(textResponse("new response"));
harness.setListModelsData([createTestModel({ id: "claude-4" })]);
harness.setListAppsData([{ id: "app-1", handle: "my-app", ... }]);
harness.setPlatformCaller(() => createMockPlatformCaller({ ... }));
```

## Options Reference

### `createPoeTileTestHarness` Options

| Option | Default | Description |
|--------|---------|-------------|
| `apiHarness` | `new ApiTestServer()` | `IApiTestHarness` instance — override with a custom implementation |
| `getBotResponse` | Empty text response | Bot response handler (async generator) |
| `store` | — | Omit to skip store. `{ backendConfig: { mutators: {} } }` for defaults. |
| `store.storeTypeId` | `"test"` | Store type ID for registration |
| `store.backendConfig` | (required) | Server-side backend config (`mutators`, `actions`, `schema`) |
| `otherStores` | — | Additional store backends keyed by `storeTypeId` for cross-app testing |
| `listModels` | `[]` | Initial models for `Poe.listModels()` |
| `listApps` | `[]` | Initial apps for `Poe.tiles.list()` and `Poe.tiles.get()` |
| `openProps` | `null` | JSON data for `Poe.getOpenProps()` |
| `allowedStoreErrors` | `[]` | Allowlist for the harness's default assertion that no client logged a `logger.error(...)` call (see `storeErrorLogs` below). Each entry is a `string` (substring match) or `RegExp` tested against the captured log's formatted text. Only list the specific error(s) a test intentionally provokes — never a catch-all pattern. |
| `createPlatformCaller` | Mock | Custom platform caller factory for actions and discouraged idempotent/read-only guarded server-side mutator calls |

### `createClient()` Result

| Property | Description |
|----------|-------------|
| `Poe` | Full production Poe API (stream, call, listModels, etc.) |
| `store` | Typed SyncedStoreClient (already synced with server data) |
| `storeErrorLogs` | Every `logger.error(...)` from this client's store stack, in order (raw args arrays). In production these land in the user's console; the harness captures them instead. Common signals: `"Synced State | Error rebasing mutation"` (a pending mutation's mutator threw while replaying on freshly pulled server state — not replay-safe) and `"[synced-store] mutation failed"` (a non-retriable server-side rejection, including the case where the optimistic overlay briefly showed success before the server rolled it back). `harness.dispose()` already asserts every captured log across every client the harness created matches an entry in `allowedStoreErrors` — you don't need to assert this yourself. A test that intentionally exercises a rejected-mutation or error path should pass the specific expected error text/pattern via `allowedStoreErrors` to `createPoeTileTestHarness(...)`, not a catch-all. |
| `dispose()` | Clean up this client's resources |

### `createControlledClient()` Result

Same as `createClient()` plus:

| Property | Description |
|----------|-------------|
| `transport` | QueuedTransport for manual flush control |

### Harness Methods

| Method | Description |
|--------|-------------|
| `harness.createClient(opts?)` | Create a connected client with server data loaded |
| `harness.createControlledClient(opts?)` | Create a client with manual flush control |
| `harness.removeUser({ userId, removedBy? })` | Fire the `onRemoveUser` system mutator on the test backend (default `removedBy: "system"`). Useful for membership-removal flows; `client.dispose()` only disconnects and does not remove room membership. |
| `harness.setBotResponseHandler(handler)` | Replace bot response handler |
| `harness.setListModelsData(models)` | Replace models list |
| `harness.setListAppsData(apps)` | Replace apps list |
| `harness.setPlatformCaller(factory)` | Replace platform caller factory |
| `harness.requests` | All captured requests |
| `harness.getRequests(method)` | Filter captured requests by method |
| `harness.multiAppHarness` | The underlying multi-app harness (advanced) |
| `harness.dispose()` | Clean up all resources |
