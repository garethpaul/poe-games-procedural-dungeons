<!-- owner: jyoung-q -->
# E2E Tests With Playwright

End-to-end tests verify that your app works correctly in a real browser, including store initialization, mutations, subscriptions, and multi-user sync over WebSockets.

## TestServer

Similar to how Cloudflare provides [Miniflare](https://miniflare.dev/) for local Workers development, `TestServer` is a mini-implementation of the Poe Tiles platform for writing E2E Playwright tests. It runs entirely in-process with in-memory storage — no external services needed.

```typescript
import { TestServer } from "poe-tiles-sdk/v1/test-utils/playwright.js";
```

### API

| Method | Description |
|--------|-------------|
| `new TestServer(options?)` | Create a server (accepts optional `createPlatformCaller` callback) |
| `server.start()` | Start the E2E server (async) |
| `server.registerTile({ typeId, content })` | Register an app from a local directory |
| `server.sessionUrl({ tileTypeId, instanceId, userId, clientId })` | Generate a URL for a user session |
| `server.close()` | Shut down all servers and workers |

## Basic Test Setup

```typescript
import { test, expect } from "@playwright/test";
import { TestServer } from "poe-tiles-sdk/v1/test-utils/playwright.js";

const server = new TestServer();

test.beforeAll(async () => {
  await server.start();
  await server.registerTile({
    typeId: "my-todo-app",
    content: { type: "directory", dir: "./path/to/app" },
  });
});

test.afterAll(() => {
  server.close();
});
```

### Registering Apps

`registerTile` takes a directory containing your app files (HTML, JS, CSS). The directory is zipped and uploaded to the in-memory blob storage, just like the production deployment pipeline.

For bundled apps, build first then register the output directory:

```typescript
import * as esbuild from "esbuild";
import { buildBackend } from "poe-tiles-sdk/vite";

test.beforeAll(async () => {
  // Build frontend + backend
  await Promise.all([
    esbuild.build({
      entryPoints: [join(FIXTURE_DIR, "src/App.tsx")],
      bundle: true, format: "esm", target: ["es2020"], platform: "browser",
      outfile: join(OUT_DIR, "tile-frontend.js"),
      external: ["poe-tiles-sdk/v1/client.js", "@synced-store/client", "@synced-store/shared"],
      logLevel: "error",
    }),
    buildBackend({
      entryPoint: join(FIXTURE_DIR, "src/backend.ts"),
      outDir: OUT_DIR,
    }),
  ]);

  // Copy the HTML entry point
  copyFileSync(join(FIXTURE_DIR, "index.html"), join(OUT_DIR, "index.html"));

  // Start server and register
  await server.start();
  await server.registerTile({
    typeId: "bundled-todo",
    content: { type: "directory", dir: OUT_DIR },
  });
});
```

## Writing Tests

### Accessing the App Iframe

Apps run inside a blob URL iframe. Playwright's `frameLocator()` cannot access `blob:` origins, so use the `waitForBlobFrame()` helper from `poe-tiles-sdk/v1/test-utils/playwright.js`:

```typescript
import { waitForBlobFrame } from "poe-tiles-sdk/v1/test-utils/playwright.js";

test("app loads and shows ready status", async ({ page }) => {
  await page.goto(
    server.sessionUrl({
      tileTypeId: "my-todo-app",
      instanceId: "test-instance",
      userId: "alice",
      clientId: "client-alice",
    }),
  );

  const iframe = await waitForBlobFrame(page);

  // Wait for the store subscription to fire
  await expect(iframe.locator("#status")).toHaveText("ready", {
    timeout: 15_000,
  });
});
```

### Testing Mutations

```typescript
test("adds a todo item via Poe.store.mutate", async ({ page }) => {
  await page.goto(
    server.sessionUrl({
      tileTypeId: "my-todo-app",
      instanceId: "add-test",
      userId: "alice",
      clientId: "client-alice",
    }),
  );

  const iframe = await waitForBlobFrame(page);
  await expect(iframe.locator("#status")).toHaveText("ready", {
    timeout: 15_000,
  });

  // Type a todo and click Add
  await iframe.locator("#todo-input").fill("Buy milk");
  await iframe.locator("#add-btn").click();

  // The subscription should update the list
  await expect(iframe.locator("#todo-list")).toContainText("Buy milk", {
    timeout: 10_000,
  });
});
```

## Multi-User Sync Tests

To test real-time synchronization between users, create separate browser contexts. Each context gets its own cookies and storage, simulating independent users:

```typescript
test("syncs mutations between two users via WebSocket", async ({
  browser,
}) => {
  test.setTimeout(60_000);

  // Create separate browser contexts for each user
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  try {
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Both users connect to the SAME app instance
    await page1.goto(
      server.sessionUrl({
        tileTypeId: "my-todo-app",
        instanceId: "sync-test",  // Same instance
        userId: "alice",
        clientId: "client-alice",
      }),
    );

    await page2.goto(
      server.sessionUrl({
        tileTypeId: "my-todo-app",
        instanceId: "sync-test",  // Same instance
        userId: "bob",
        clientId: "client-bob",
      }),
    );

    const iframe1 = await waitForBlobFrame(page1);
    const iframe2 = await waitForBlobFrame(page2);

    // Wait for both to be ready
    await expect(iframe1.locator("#status")).toHaveText("ready", {
      timeout: 15_000,
    });
    await expect(iframe2.locator("#status")).toHaveText("ready", {
      timeout: 15_000,
    });

    // User 1 adds a todo
    await iframe1.locator("#todo-input").fill("Alice's todo");
    await iframe1.locator("#add-btn").click();

    // User 2 sees it via WebSocket sync
    await expect(iframe2.locator("#todo-list")).toContainText(
      "Alice's todo",
      { timeout: 15_000 },
    );

    // User 2 adds a todo
    await iframe2.locator("#todo-input").fill("Bob's todo");
    await iframe2.locator("#add-btn").click();

    // User 1 sees it via sync
    await expect(iframe1.locator("#todo-list")).toContainText("Bob's todo", {
      timeout: 15_000,
    });
  } finally {
    await context1.close();
    await context2.close();
  }
});
```

### Key Multi-User Patterns

- **Same `instanceId`** — both users connect to the same app instance (shared data)
- **Different `userId` and `clientId`** — each user has their own identity and client
- **Separate `browser.newContext()`** — independent browser sessions (cookies, storage)
- **Sync via WebSocket** — mutations propagate through the in-memory sync server

## Testing with Platform Services

If your app's actions or guarded server-side mutator code depend on [platform capabilities](../../synced-store/references/platform.md), pass a `createPlatformCaller` callback to `TestServer`. The callback is invoked once per action/mutation request with context about the store and client, and returns a `BasePlatformCaller`. Prefer actions; mutator platform calls are discouraged, must be idempotent/read-only because optimistic-lock conflicts can retry the server mutator attempt, and should only cover short one-off server work.

### Setup

```typescript
import { test, expect } from "@playwright/test";
import { TestServer } from "poe-tiles-sdk/v1/test-utils/playwright.js";
import type { BasePlatformCaller } from "@synced-store/shared";

const server = new TestServer({
  createPlatformCaller: ({ typeId, instanceId, clientId, userId }): BasePlatformCaller => ({
    call: async (name: string, input: unknown): Promise<unknown> => {
      switch (name) {
        case "env.get":
          return { BASE_URL: "http://localhost", BLOB_HOST: "http://localhost" };
        default:
          throw new Error(`Unhandled service: ${name}`);
      }
    },
  }),
});

test.beforeAll(async () => {
  await server.start();
  await server.registerTile({
    typeId: "my-app",
    content: { type: "directory", dir: "./path/to/app" },
  });
});

test.afterAll(() => {
  server.close();
});
```

### Backend config

Define actions, or guarded server-side mutator branches, that access `ctx.platform`:

```javascript
// synced-store-backend-config.js
async function getBaseUrl(ctx) {
  const env = await ctx.platform.call("env.get", {});
  return { baseUrl: env.BASE_URL };
}

export default {
  mutators: {},
  actions: { getBaseUrl },
};
```

### Test

```typescript
test("action returns the base URL from platform", async ({ page }) => {
  await page.goto(
    server.sessionUrl({
      tileTypeId: "my-app",
      instanceId: "test",
      userId: "alice",
      clientId: "client-alice",
    }),
  );

  const iframe = await waitForBlobFrame(page);
  await expect(iframe.locator("#status")).toHaveText("ready", {
    timeout: 15_000,
  });

  // Trigger the action (e.g. via a button click)
  await iframe.locator("#get-base-url-btn").click();

  // Verify the action result was rendered
  await expect(iframe.locator("#base-url-result")).toHaveText(
    "http://localhost",
    { timeout: 10_000 },
  );
});
```

### How it works

1. `createPlatformCaller` returns a `BasePlatformCaller` with a single `call(name, input)` method
2. The caller is converted to a `PlatformCallerFn` function and proxied via RPC to the worker thread
3. Inside action handlers or guarded server-side mutator code, `ctx.platform.call(name, input)` dispatches to the transport; mutator calls must be awaited before the mutator returns and must be idempotent/read-only because optimistic-lock conflicts can retry the server attempt
4. See [Platform](../../synced-store/references/platform.md) for the full list of available service names

## How the Test Infrastructure Works

When `page.goto(sessionUrl)` is called, the following happens:

1. The main HTTP server serves a **top document** containing an iframe
2. The iframe loads your app from a per-bundle HTTP server
3. The top document runs a **host bundle** that sets up `postMessage` responders for the iframe:
   - `__poe_store__` channel — proxies kv storage, network transport, and device channel
   - `__poe_iframe_rpc__` channel — proxies bot API calls
4. The iframe app calls `Poe.setupStore()`, which connects to the store by communicating with the top document via `postMessage`
5. The store's network transport connects to the **WebSocket sync server** via the top document
6. Pull/push/poke messages flow through the WebSocket connection


## AI-Powered Tests with Stagehand

[Stagehand](https://github.com/browserbase/stagehand) lets you write tests using plain-English instructions instead of CSS selectors. It sends a screenshot + DOM snapshot to Claude, which resolves the element and performs the action. Stagehand auto-traverses all frames — including blob URL iframes — so instructions apply across the full page.

```typescript
// Relative path required — Playwright uses Node's ESM resolver which
// can't resolve @test-utils subpath exports.
import { createStagehand } from "../../../packages/test-utils/stagehand";
```

**When to use Stagehand:**
- Interactions that are hard to express as CSS selectors (e.g. "click the e2 pawn" instead of `cells.nth(52).click()`)
- Tests that should survive HTML/CSS refactors — the intent stays stable when selectors break

**When to keep regular selectors:**
- Accessibility checks (`checkA11y`) — requires a `Frame` object
- Fast CI tests — Stagehand makes one LLM call per action (~1–3s each)

### Setup

Add `ANTHROPIC_API_KEY` to `.env`. Tests skip automatically when the key is absent:

```typescript
test("AI-powered interaction", async () => {
  if (!process.env.ANTHROPIC_API_KEY) return test.skip();
  // ...
});
```

### Usage

```typescript
// Relative path required — Playwright uses Node's ESM resolver which
// can't resolve @test-utils subpath exports.
import { createStagehand } from "../../../packages/test-utils/stagehand";

test("clicking a pawn reveals legal moves", async () => {
  if (!process.env.ANTHROPIC_API_KEY) return test.skip();
  const stagehand = await createStagehand(server.sessionUrl({ ... }));
  try {
    await stagehand.act("wait until the chess board is visible");
    await stagehand.act("click the e2 pawn on the chess board");
    // combine with DOM assertions via the blob frame:
    const page = stagehand.context.activePage();
    const blobFrame = page!.frames().find(f => f.url().startsWith("blob:"));
    const count = await blobFrame!.evaluate(
      () => document.querySelectorAll(".move-indicator").length
    );
    if (count === 0) throw new Error("No move indicators found");
  } finally {
    await stagehand.close();
  }
});
```

`createStagehand(url)` launches a headless Chromium, navigates to `url`, and returns a ready-to-use `Stagehand` instance. The browser is torn down by calling `stagehand.close()`.

**Model**: defaults to `claude-haiku-4-5-20251001` (fastest, lowest cost). Override per-call:
```typescript
await stagehand.act("...", { model: "anthropic/claude-sonnet-4-6" });
```

## Test File Naming

E2E test files should use the `.test.playwright.ts` extension:

```
my-app/
├── __tests__/
│   └── e2e/
│       ├── my-app.test.playwright.ts   # Playwright E2E tests
│       └── fixtures/                    # App fixture files
```

## Tips

- Use generous timeouts (10-15s) for initial load — the first `Poe.setupStore()` needs to complete a pull handshake
- Use `test.setTimeout(60_000)` for multi-user tests that involve multiple page loads
- The `#status` element pattern (showing "loading" → "ready") is a reliable way to wait for store initialization
- For sandboxed iframes, use `page.frame({ url: /bundleId=/ })` instead of `frameLocator`
