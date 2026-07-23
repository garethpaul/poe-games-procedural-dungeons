<!-- owner: jyoung-q -->
# Testing: Optimistic vs Server-Verified Values

Mutators run twice: optimistically on the client, authoritatively on the server. To compare both, disable outbound auto-flush, query after `mutate()` (optimistic), then flush and query again (server-verified).

```typescript
import { test, expect } from "bun:test";
import { createPoeTileTestHarness } from "poe-tiles-sdk/v1/test-utils.js";
import { tileBackendConfig } from "../synced-store/backend-config";
import type { TileSchema } from "../synced-store/schema";

test("optimistic value differs from server-verified value", async () => {
  const harness = createPoeTileTestHarness<TileSchema>({
    store: { backendConfig: tileBackendConfig },
  });
  const { store, transport } = await harness.createControlledClient();
  await transport.flushUntil(store.waitForServerData());

  // Block pushes so the server-verified run can't replace the optimistic
  // patches before we observe them.
  transport.outbound.disableAutoFlush();

  const { confirmed } = await store.mutate.setIsServerFlag({ key: "k" });

  // Optimistic — mutator ran on the client. ctx.isServer === false.
  const optimistic = await store.query((tx) => tx.table("main").get("k"));
  expect(optimistic).toBe(false);

  // Release pushes; server runs mutator authoritatively and rebases.
  transport.outbound.enableAutoFlush();
  await transport.flushUntil(confirmed);

  // Server-verified — same row, now backed by the server commit.
  const authoritative = await store.query((tx) => tx.table("main").get("k"));
  expect(authoritative).toBe(true);

  harness.dispose();
});
```

Key points:
- `transport.outbound.disableAutoFlush()` is the gate — without it the server roundtrip can race the optimistic query
- `await store.mutate.X(...)` resolves once the optimistic patches are applied locally, before any push
- `await transport.flushUntil(confirmed)` releases pushes and waits for the server's authoritative commit + rebase
- After the rebase, the optimistic patches are removed and the row reflects the server-authoritative result

For the underlying transport API (flush methods, queue introspection), see [testing-network-control.md](testing-network-control.md).
