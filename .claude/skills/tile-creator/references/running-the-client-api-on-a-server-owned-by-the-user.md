<!-- owner: jyoung-q -->
# Running the Client API on a server owned by the user

Normally the `poe-tiles-sdk` client is initialized inside a web browser. To initialize it inside a Node.js or Bun process, use the `NodeEnvironment` helper — for example, to build agents (like OpenClaw) that interact with a Poe tile instance on a user's behalf.

```typescript
import { NodeEnvironment } from "poe-tiles-sdk/v1/node.js";
import { createPoe } from "poe-tiles-sdk/v1/client.js";

const env = new NodeEnvironment({
  apiUrl: "https://poe-tiles.quora-913.workers.dev",
  headers: { Cookie: "session_token=..." },
  websocketUrl:
    "wss://poe-tiles.quora-913.workers.dev/api/v1/user-router?clientId=c1&userId=u1",
  storeConfig: {
    clientId: "c1",
    instanceId: "i1",
    optimisticUserId: "u1",
    storeTypeId: "my-app",
  },
});

const poe = createPoe({ environment: env });
const store = poe.setupStore(myClientConfig);
await store.waitForServerData();
```

For in-browser apps, use [`PostMessageEnvironment`](./client-api.md#initialization) instead. For unit tests against mocked bots, use [`createPoeTileTestHarness()`](./unit-tests.md).

## How it works

`NodeEnvironment` wires the same kernel that powers canvas-frame apps, but against real HTTP + WebSocket transports instead of `postMessage`:

```
HTTP API ← PoeClientApiBackend (models, bot SSE streaming)
                  ↓
HostKernelRpcHandlers ← in-memory RPC ← createPoe()
                  ↓
WebSocket → UserRouterClient → ClientSyncCoordinator
                  ↓
ClientSession ← in-memory store transport ← SyncedStoreClient
```

There is no iframe and no `postMessage` — the RPC transport is an in-memory pipe between `createPoe()` and the node-side handlers. Bot requests go over HTTP. Synced-store sync goes over WebSocket to the user-router.

## Options

```typescript
interface NodeEnvironmentOptions {
  /** Base URL for the poe-tiles API (e.g. "https://poe-tiles.quora-913.workers.dev"). */
  apiUrl: string;

  /**
   * Headers sent with every HTTP request (API + bot SSE streaming).
   * Use for authentication: { Cookie: "session=..." }.
   */
  headers?: Record<string, string>;

  /** WebSocket URL for user-router. Default: process.env.POE_WEBSOCKET_URL */
  websocketUrl?: string;

  /** Store configuration. Default: JSON.parse(process.env.POE_STORE_CONFIG) */
  storeConfig?: StoreEnvironmentConfig;
}
```

`websocketUrl` and `storeConfig` can be supplied via environment variables (`POE_WEBSOCKET_URL` and `POE_STORE_CONFIG`) to keep invocation scripts terse. If both the option and the env var are missing, the constructor throws.

## Authentication

`NodeEnvironment` does not mint sessions — pass an existing session cookie (or any other credentials the server accepts) via `headers`. Typical flow:

1. Call `POST /api/v1/auth/login` with a Poe API key to obtain a `session_token` cookie.
2. Pass `{ Cookie: "session_token=..." }` as `headers` when constructing `NodeEnvironment`.

## Limitations

Some parts of the `Poe` surface only make sense inside a browser and will throw if called from a `NodeEnvironment`:

- **Assets** — `poe.getBundleAssetUrl()` and related asset APIs require blob URLs and a DOM cache.
- **Sub-apps** — the `<poe-tile>` custom element needs a host frame to mount child iframes (it drives the internal `tiles.openChild` host RPC). There is no callable `poe.tiles.openChild()` — `poe.tiles` exposes only the catalog methods (`list`, `get`, `search`, `preload`, `publish`); nesting sub-apps is unsupported outside a browser regardless.
- **`createStoreTransport()`** — can only be called once. `poe.setupStore()` consumes it; calling it a second time throws.

KV storage for synced-store is **in-memory** — Node agents are ephemeral, so there is no IndexedDB. Restarting the process re-bootstraps from the server.

## Cleanup

Always call `env.dispose()` when you are done. It closes the WebSocket, disposes the sync coordinator, and tears down the RPC client. Skipping it will leave the process hanging on open handles.

```typescript
try {
  // ...use poe...
} finally {
  env.dispose();
}
```
