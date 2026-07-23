<!-- owner: jyoung-q -->
# Testing: Race Conditions

Real networks deliver messages out of order. The test harness lets you reproduce these scenarios deterministically. See [testing-network-control.md](testing-network-control.md) for the base controlled-client setup.

## Poke Arrives Before Push Response

A classic race: the server broadcasts a poke (containing the result of our own mutation) before the client receives the push response acknowledging that mutation. Use `flushMatching` to deliver messages in a specific order:

```typescript
import { hasInboundType } from "poe-tiles-sdk/v1/test-utils.js";

test("poke arrives before push response", async () => {
  const { store, transport } = await harness.createControlledClient();
  await transport.flushUntil(store.waitForServerData());

  transport.outbound.disableAutoFlush();
  transport.inbound.disableAutoFlush();

  const { confirmed } = await store.mutate.setValue({
    key: "race",
    value: "value",
  });

  // Send the push request to the server
  await transport.outbound.flushNext();

  // Deliver the poke BEFORE the push response
  await transport.inbound.flushMatching(hasInboundType("poke"));
  await transport.inbound.flushMatching(hasInboundType("push_response"));

  await confirmed;
  const value = await store.query((tx) => tx.table("data").get("race"));
  expect(value).toBe("value");
  expect(store.getPendingCount()).toBe(0);

  harness.dispose();
});
```

`flushMatching` reorders the queue to deliver the first message matching the predicate, leaving other messages in place. This is the key tool for testing message reordering.

## Concurrent Mutations from Multiple Clients

Two clients mutating simultaneously must converge to the same final state:

```typescript
test("concurrent mutations from multiple clients", async () => {
  const alice = await harness.createControlledClient({ userId: "alice" });
  const bob = await harness.createControlledClient({ userId: "bob" });

  // Initialize both clients
  await Promise.all([
    alice.transport.flushUntil(alice.store.waitForServerData()),
    bob.transport.flushUntil(bob.store.waitForServerData()),
  ]);

  // Both clients mutate before either flushes
  await alice.store.mutate.increment({ key: "counter", amount: 1 });
  await bob.store.mutate.increment({ key: "counter", amount: 1 });

  // Step both clients through their network queues
  await Promise.all([alice.transport.step(), bob.transport.step()]);
  // Step again to deliver cross-client pokes
  await Promise.all([alice.transport.step(), bob.transport.step()]);

  const value = await alice.store.query((tx) => tx.table("data").get("counter"));
  expect(value).toBe(2);

  harness.dispose();
});
```

## Pattern

1. `disableAutoFlush()` on both directions.
2. Drive mutations from each client.
3. Use `flushMatching`, `flushNext`, or `step` to deliver messages in the order you want.
4. Assert convergence at the end.
