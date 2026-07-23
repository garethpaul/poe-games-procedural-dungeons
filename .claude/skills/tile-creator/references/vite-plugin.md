<!-- owner: jyoung-q -->
# Vite Plugin

The `poeTile()` Vite plugin handles the Poe-specific build concerns that every bundled iframe app needs. Import it from `poe-tiles-sdk/vite`.

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { poeTile } from "poe-tiles-sdk/vite";

export default defineConfig({
  root: "tile",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "tile-frontend.js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  plugins: [react(), poeTile()],
});
```

The plugin handles:

- **Externals** — Prevents bundling platform-provided modules (`poe-tiles-sdk/v1/client.js`) since these are provided at runtime via import map.
- **Code splitting** — Rewrites dynamic `import()` calls to load chunks via `Poe.getBundleAssetUrl()`, which returns blob URLs that work in sandboxed iframes.
- **Vendor extraction** — Shared dependencies (from `node_modules`) are automatically extracted into a `vendor` chunk so they aren't duplicated across lazy chunks.
- **Backend building** — Optionally builds the synced-store backend config as part of the Vite build.

The plugin does **not** set `root`, `outDir`, `entryFileNames`, or `assetFileNames` — consumers control their own directory structure and output naming via standard Vite config.

## Backend Config Building

Pass `backendEntryPoint` to build the synced-store backend config automatically after the Vite build:

```typescript
export default defineConfig({
  root: "tile",
  build: { outDir: "../dist" },
  plugins: [
    react(),
    poeTile({ backendEntryPoint: "src/backend.ts" }),
  ],
});
```

The path is resolved relative to the Vite root directory. The output (`synced-store-backend-config.js`) is placed in the Vite output directory. This eliminates the need for a separate `buildBackend()` call in your build script.

## Code Splitting

Dynamic `import()` calls are rewritten so that chunks are loaded via `Poe.getBundleAssetUrl()`. This is more reliable than normal browser-cached imports — the browser's HTTP cache may evict entries at any time, so lazy-loaded chunks fetched over the network can fail offline. Assets loaded via `Poe.getBundleAssetUrl()` are stored in IndexedDB by the top document, so they remain available even without a network connection.

## No-Build vs Bundled

| | No-Build | Bundled |
|---|---|---|
| Import | `poe-tiles-sdk/v1/client.js` | `poe-tiles-sdk/v1/client.js` |
| Schema | Inline mutators | `defineSchema()` + `defineClientConfig()` |
| Config | `{ mutators, schemaVersion }` | Pre-built client config object |
| Types | None (plain JS) | Full type inference from Zod schema |
