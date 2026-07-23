<!-- owner: jyoung-q -->
# Testing: Actions

Actions are server-only operations that appear on the store client as `store.action.<name>(...)`. Testing them with `createPoeTileTestHarness` works the same as testing mutators — the harness runs the action's server handler in-process.

```typescript
test("execute actions", async () => {
  const harness = createPoeTileTestHarness<MySchema>({
    store: { backendConfig: myBackendConfig },
  });
  const { store } = await harness.createClient({ userId: "alice" });

  const result = await store.action.bulkSet({
    items: [
      { key: "a", value: 1 },
      { key: "b", value: 2 },
    ],
  });

  expect(result.count).toBe(2);

  harness.dispose();
});
```

## Awaiting Mutators That Enqueue Actions

When a mutator calls `ctx.enqueueAction("foo", input)` to fire follow-up
work after commit (e.g. a state-machine `setReady` mutator that enqueues
`tryAdvancePhase` once everyone is ready), tests can't observe the action's
effects by simply awaiting the mutator's `confirmed` promise — `enqueueAction`
runs the handler **after** the mutation commits, in a separate task, and the
public test harness has no API to wait for that queue to drain.

**Don't** use `setTimeout` / `setImmediate` / `sleep` to "wait long enough" —
the test lint rules flag them, and `tick()` (which is the recommended
substitute) only yields one event-loop turn, so it can't reliably drain
the multi-hop `enqueueAction → action → mutator` chain either. Reach
for the deterministic `store.action.<name>(...)` call below instead.

**Do** call the action directly via `store.action.<name>(input)` after the
mutator. Actions are idempotent gate-checks by convention (read state, decide
whether to advance, no-op if conditions aren't met), so calling them in a test
is safe and produces the same observable effect as the production
`enqueueAction` path. The action call returns when the action and any
mutators it dispatches have been processed:

```typescript
// Production code (mutator):
//   setReady: async (ctx, input) => {
//     await ctx.table("players").set({ itemKey: ctx.userId, value: { ready: input.ready } });
//     ctx.enqueueAction("tryAdvancePhase", {});  // fire-and-forget after commit
//   }
//
// Production action `tryAdvancePhase` reads the players table and, if all are
// ready, calls a mutator that flips the phase.

// Test:
type TileStoreClient = InferSyncedStoreClient<TileSchema>;

async function readyAndAdvance(store: TileStoreClient): Promise<void> {
  await (await store.mutate.setReady({ ready: true })).confirmed;
  await store.action.tryAdvancePhase({});  // waits for action + dispatched mutators
}

test("two players ready -> phase advances", async () => {
  const harness = createPoeTileTestHarness<TileSchema>({
    store: { backendConfig: tileBackendConfig },
  });
  const { store: alice } = await harness.createClient({ userId: "alice" });
  const { store: bob } = await harness.createClient({ userId: "bob" });

  await readyAndAdvance(alice);
  expect(await alice.query((tx) => tx.table("game").get("phase"))).toBe("lobby");

  await readyAndAdvance(bob);
  expect(await alice.query((tx) => tx.table("game").get("phase"))).toBe("playing");
});
```

The action runs the same handler in-process whether triggered by `enqueueAction`
in production or by `store.action.X(...)` in a test. As long as the action
guards on phase/precondition checks and is safe to call multiple times, this
gives you a deterministic test without any sleep/poll/flakiness.

## Actions That Call Platform Services

If your action or discouraged idempotent/read-only guarded server-side mutator calls [platform capabilities](platform.md), wire a mock platform caller:

```typescript
import { createMockPlatformCaller } from "poe-tiles-sdk/v1/test-utils.js";

const harness = createPoeTileTestHarness<MySchema>({
  store: {
    backendConfig: myBackendConfig,
    createPlatformCaller: () => createMockPlatformCaller(),
  },
});
```

The mock returns deterministic responses for all platform calls — no real API keys, no network.

## Cached/Empty State Before Server Data Arrives

Use `createControlledClient()` when you need to observe the client before the initial server pull completes — useful for testing cold-start UI states:

```typescript
test("test cached state before server data", async () => {
  const { store, transport } = await harness.createControlledClient();

  // Store is set up but NOT synced yet — server data hasn't arrived
  // Assert on cached/empty state here...

  // Flush to let server data through
  await transport.flushUntil(store.waitForServerData());

  // Server data has arrived — assert on synced state
});
```

See [testing-network-control.md](testing-network-control.md) for the full controlled-client API.
