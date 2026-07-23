<!-- owner: jyoung-q -->
# Testing: Network Failures

Simulate disconnects and reconnects on the test transport. Pending mutations are preserved and retried on reconnect. See [testing-network-control.md](testing-network-control.md) for the base controlled-client setup.

## Disconnect and Reconnect

```typescript
test("push response lost - mutation retries on reconnect", async () => {
  const { store, transport } = await harness.createControlledClient();
  await transport.flushUntil(store.waitForServerData());

  transport.outbound.disableAutoFlush();
  transport.inbound.disableAutoFlush();

  await store.mutate.setValue({ key: "test", value: "original" });

  // Server receives and processes the push...
  await transport.outbound.flushNext();

  // ...but the response is lost due to a network failure
  transport.simulateDisconnect({ rejectPending: true });
  expect(store.getPendingCount()).toBe(1);

  // Client reconnects — pending mutations are pushed automatically
  transport.simulateReconnect();
  transport.enableAutoFlush();
  await transport.step();

  expect(store.getPendingCount()).toBe(0);

  harness.dispose();
});
```

`simulateDisconnect({ rejectPending: true })` rejects all in-flight requests (hard network failure). Pass `{ rejectPending: false }` to leave them unresolved instead (hung connection).

## Offline Mutations With Late Sync

Use `blockReconnect: true` to keep the client offline until you explicitly reconnect. Great for testing "made changes while offline, came back, everything converged":

```typescript
test("offline mutations sync after reconnect", async () => {
  const { store: store1, transport: t1 } = await harness.createControlledClient({ userId: "alice" });
  await t1.flushUntil(store1.waitForServerData());

  // Client 1 goes offline
  t1.simulateDisconnect({ rejectPending: true, blockReconnect: true });

  // Client 1 makes mutations while offline
  await store1.mutate.setValue({ key: "offline", value: "from-alice" });
  expect(store1.getPendingCount()).toBe(1);

  // Meanwhile, client 2 joins and makes its own mutations
  const { store: store2, transport: t2 } = await harness.createControlledClient({ userId: "bob" });
  await t2.flushUntil(store2.waitForServerData());
  await store2.mutate.setValue({ key: "online", value: "from-bob" });
  await t2.step();

  // Client 1 comes back online — pending mutations push automatically
  t1.simulateReconnect();
  t1.enableAutoFlush();
  await t1.step();

  // Both clients converge
  expect(await store2.query((tx) => tx.table("data").get("offline"))).toBe("from-alice");
  expect(await store1.query((tx) => tx.table("data").get("online"))).toBe("from-bob");

  harness.dispose();
});
```

## API Reference

| Method | Description |
|--------|-------------|
| `transport.simulateDisconnect({ rejectPending, blockReconnect })` | Drop the connection. `rejectPending: true` fails in-flight requests; `blockReconnect: true` prevents auto-reconnect until `simulateReconnect` |
| `transport.simulateReconnect()` | Restore the connection (and lift `blockReconnect`) |
| `transport.enableAutoFlush()` | Re-enable automatic delivery for both directions |
| `store.getPendingCount()` | Count unconfirmed local mutations |
