<!-- owner: jyoung-q -->
# Synced-Store Testing Patterns

## Table of Contents
- [Unit Test Harness](#unit-test-harness)
- [Querying Data](#querying-data)
- [Multi-Client Tests](#multi-client-tests)
- [E2E Playwright Tests](#e2e-playwright-tests)

## Unit Test Harness

```typescript
import { describe, expect, test } from "bun:test";
import { createPoeTileTestHarness } from "poe-tiles-sdk/v1/test-utils.js";
import { tileBackendConfig } from "../synced-store/backend-config";
import type { TileSchema } from "../synced-store/schema";

function createStore() {
  return createPoeTileTestHarness<TileSchema>({
    store: { backendConfig: tileBackendConfig },
  });
}
```

## Querying Data

```typescript
// Get a single record
const record = await store.query((tx) => tx.table("game").get("game"));

// Get all entries
const entries = await store.query((tx) => tx.table("items").entries().toArray());
// entries is [key, value][] — map to get values:
const items = entries.map(([, v]) => v as ItemType);
```

## Multi-Client Tests

A single mutation followed by a single peer read works because the harness propagates synchronously enough that the read sees the post-commit state:

```typescript
test("two players see synced state", async () => {
  const harness = createStore();
  const { store: alice } = await harness.createClient({ userId: "alice" });
  const { store: bob } = await harness.createClient({ userId: "bob" });

  await alice.mutate.setItem({ id: "1", text: "hello" });

  const item = await bob.query((tx) => tx.table("items").get("1"));
  expect(item).toMatchObject({ id: "1", text: "hello" });
});
```

But sequential mutations from *different* pre-existing clients race each other's optimistic state — bob's optimistic pass runs against his pre-mutation snapshot of the world, not alice's freshly-committed one. Use the `waitFor*` family from `poe-tiles-sdk/v1/test-utils.js` to gate on propagated state before the next mutation. The most flexible option is `waitForKeyMatch`:

`store.query`, `store.subscribe`, `waitFor`, and `waitForAllClients` use the same callback contract: pass `(tx) => ...` and read through that transaction. Do not pass a helper that expects the store/client object itself. The convenience helpers (`waitForKeyExists`, `waitForValue`, `waitForKeyMatch`, `waitForKeyDeleted`) take `{ table, key, ... }` parameter objects instead. Reusable read helpers should accept `InferReadContext<TileSchema>` so they work from queries, subscriptions, mutators, and tests.

> **Common failure: "all submitters trigger" mutators.**
>
> - The pattern: a mutator scans a public table to detect a server-aggregate condition — *"if every player has `hasSubmitted: true`, transition to revealing"*, *"if every team has filled its slot, start the game"*, etc.
> - Why it breaks with bare `await client.mutate.X(...)` between clients: the final submitter's mutator scans the table before the prior submitters' writes are committed, sees stale flags, and the trigger never fires.
> - Symptom: timing-sensitive. Often passes with 2 clients (the one prior write happens to land in time) and fails at 3+.
> - Fix: always gate cross-client steps with `waitForKeyMatch` (or at minimum `await r.confirmed`) before the next client mutates.

```typescript
import {
  waitForKeyExists,
  waitForKeyMatch,
} from "poe-tiles-sdk/v1/test-utils.js";

test("alice creates, bob completes, alice sees the merge", async () => {
  const harness = createStore();
  const { store: alice } = await harness.createClient({ userId: "alice" });
  const { store: bob } = await harness.createClient({ userId: "bob" });

  await alice.mutate.setItem({ id: "1", text: "hello", completed: false });

  await waitForKeyExists(bob, { table: "items", key: "1" });

  await bob.mutate.setItem({ id: "1", completed: true });

  await waitForKeyMatch<Item>(alice, {
    table: "items",
    key: "1",
    match: (i) => i.completed === true,
  });

  const item = await alice.query((tx) => tx.table("items").get("1"));
  expect(item).toMatchObject({ text: "hello", completed: true });
});
```

Family: `waitForKeyExists`, `waitForValue`, `waitForKeyMatch`, `waitForKeyDeleted`, `waitForAllClients`, `waitFor`. Each takes optional `{ timeoutMs, description }` and emits a descriptive timeout message on failure. Don't hand-roll `await mutate.X(); await confirmed; await waitForServerData()` — these helpers already cover that flow with proper diagnostics. Full reference and table in [Unit Tests → Multi-Client Testing](../../tile-creator/references/unit-tests.md#multi-client-testing).

```typescript
test("ctx.userId is set per client", async () => {
  const harness = createStore();
  const { store } = await harness.createClient({ userId: "alice" });
  await store.mutate.createItem({ id: "1" });

  const item = await store.query((tx) => tx.table("items").get("1"));
  expect(item.createdBy).toBe("alice"); // set via ctx.userId in mutator
});
```

## Awaiting Mutators That Enqueue Actions

Mutators that fire `ctx.enqueueAction(...)` for post-commit work need
deterministic test handling — don't use `setTimeout`/`tick`. Call the
action directly via `store.action.X(...)` after the mutator. See
[testing-actions.md → Awaiting Mutators That Enqueue Actions](testing-actions.md#awaiting-mutators-that-enqueue-actions).

## E2E Playwright Tests

```typescript
import { test, expect } from "@playwright/test";
import { TestServer, waitForBlobFrame } from "poe-tiles-sdk/v1/test-utils/playwright.js";

const server = new TestServer();

test.beforeAll(async () => {
  await server.start();
  await server.registerTile({
    typeId: "my-app",
    content: { type: "directory", dir: DIST_DIR },
  });
});

test.afterAll(() => server.close());

function sessionUrl(config: { instanceId: string; userId?: string; clientId?: string }) {
  return server.sessionUrl({
    tileTypeId: "my-app",
    instanceId: config.instanceId,
    userId: config.userId ?? "alice",
    clientId: config.clientId ?? "client-alice",
  });
}

test("app loads", async ({ page }) => {
  await page.goto(sessionUrl({ instanceId: "test-load" }));
  const frame = await waitForBlobFrame(page);
  await expect(frame.locator("#app-title")).toBeVisible({ timeout: 15_000 });
});
```

**Key points**:
- Each test must use a unique `instanceId` to avoid state leakage.
- Always `await waitForBlobFrame(page)` — the app runs inside a blob: iframe.
- Use `timeout: 15_000` on first visibility check (cold start).
- Build before running: `bun run build && bunx playwright test`.
- Multi-browser tests: use `browser.newContext()` for each player with different userId/clientId.
