<!-- owner: jyoung-q -->
# Testing: Network Control

The test harness gives you full control over network timing, letting you test optimistic updates, race conditions, reordering, and offline behavior — deterministically, with no real timers or real network connections.

## Creating a Controlled Client

Use `createControlledClient()` to get a `transport` handle with manual flush control. Messages queue on both outbound (client→server) and inbound (server→client) sides until you explicitly flush them.

```typescript
import { test, expect } from "bun:test";
import { createPoeTileTestHarness } from "poe-tiles-sdk/v1/test-utils.js";
import { myBackendConfig } from "../synced-store/backend-config";
import type { MySchema } from "../synced-store/schema";

const harness = createPoeTileTestHarness<MySchema>({
  store: { backendConfig: myBackendConfig },
});
const { store, transport } = await harness.createControlledClient();

// Initialize the client (complete the pull handshake)
await transport.flushUntil(store.waitForServerData());
```

`transport.flushUntil(store.waitForServerData())` is the standard way to initialize a controlled client before starting a scenario.

## Disabling and Enabling Auto-Flush

Toggle each direction independently:

```typescript
transport.outbound.disableAutoFlush();   // stop client→server
transport.inbound.disableAutoFlush();    // stop server→client
transport.outbound.enableAutoFlush();
transport.inbound.enableAutoFlush();
```

## Flushing Messages

| Method | Effect |
|--------|--------|
| `transport.outbound.flushNext()` | Send the next queued outbound message |
| `transport.inbound.flushOne()` | Deliver the next inbound message |
| `transport.inbound.flushAll()` | Deliver all queued inbound messages |
| `transport.step()` | One full round trip (outbound, then inbound) |
| `transport.flushUntil(promise)` | Keep flushing until a promise resolves |

## Optimistic-Update Test

Mutations apply locally before any network round trip. Verify the local state updates before anything is sent:

```typescript
test("optimistic updates visible immediately", async () => {
  const { store, transport } = await harness.createControlledClient();
  await transport.flushUntil(store.waitForServerData());

  transport.outbound.disableAutoFlush();

  await store.mutate.setValue({ key: "test", value: "optimistic" });

  // Value is readable locally, even though nothing has been sent
  const value = await store.query((tx) => tx.table("data").get("test"));
  expect(value).toBe("optimistic");

  harness.dispose();
});
```

## Protocol-Aware Queue Introspection

When you need to filter queued messages by their protocol type (e.g., `poke`, `push_response`, `pull_response`), use the protocol helpers:

```typescript
import { hasInboundType } from "poe-tiles-sdk/v1/test-utils.js";

// Check what's queued
const hasPoke = transport.inbound.queue.some(hasInboundType("poke"));

// Deliver only messages matching a predicate
await transport.inbound.flushMatching(hasInboundType("poke"));

// Remove a message from the queue without delivering it
transport.inbound.remove(hasInboundType("push_response"));
```

For reordering and failure simulation, see [testing-race-conditions.md](testing-race-conditions.md) and [testing-network-failures.md](testing-network-failures.md).
