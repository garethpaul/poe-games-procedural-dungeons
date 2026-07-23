<!-- owner: jyoung-q -->
# Assets

> **Use real assets, not emoji.** For icons, glyphs, and decorative art, ship
> SVGs or generated image assets rather than Unicode emoji. Emoji render
> inconsistently across devices and make an app look cheap. Emoji that *users*
> author (chat, reactions) are content, not part of the app's UI, and are fine.

> **Bundle the asset — don't hot-link a remote URL.** Load a tile's own
> images / fonts / data from the bundle, never from a remote CDN (a hardcoded
> `<img src="https://…">` or a `fetch()` to a CDN host). Tiles cold-start
> offline and render before the network is up, so a remote fetch flashes the
> broken-image placeholder on cold-cache / offline launches and only "works"
> once the browser has cached it. Download the file into the tile and load it
> via `?url` (inlined) or `Poe.getBundleAssetUrl()` (below). Remote URLs are
> only for genuinely dynamic, user-supplied content (e.g. a user's uploaded
> avatar) — never the app's own static art.

Three ways to ship + load files in a Poe tile.

## Static asset → `import "./img.svg?url"`

Vite inlines as `data:` URL when under `assetsInlineLimit`. Use for known paths.

```typescript
// @ts-expect-error — no built-in TS types for Vite URL imports
import logoUrl from "./assets/logo.svg?url";
img.src = logoUrl;
```

```typescript
// vite.config.ts — bump limit so files inline (sandbox iframe origin is "null",
// hashed asset paths don't reliably resolve).
export default defineConfig({
  build: { assetsInlineLimit: 10 * 1024 * 1024 }, // 10 MB
  plugins: [poeTile()],
});
```

`?raw` for inline text.

## Runtime asset → `Poe.getBundleAssetUrl(path)`

Returns cached `blob:` URL. Use for dynamic paths, large files, no-build apps.

```typescript
img.src = await Poe.getBundleAssetUrl("/assets/hero.png");
const data = await fetch(await Poe.getBundleAssetUrl("data/levels.json")).then(r => r.json());
```

Leading slash / bare / `./` all equivalent. Cached. See [client-api.md](./client-api.md#poe-getbundleasseturl-path).

## Lazy code chunk → `import("./mod")`

Plugin rewrites dynamic `import()` to fetch chunks via `getBundleAssetUrl()`. Lazy CSS auto-loaded with its JS chunk.

```typescript
const Heavy = React.lazy(() => import("./Heavy"));    // React
const Heavy = lazy(() => import("./Heavy"));          // SolidJS
const { compute } = await import("./compute");        // plain
```

## Pick

| Need | Use |
|---|---|
| Static path, small | `import "...?url"` |
| Dynamic path / large / no build | `Poe.getBundleAssetUrl(path)` |
| Defer code module | `import("./mod")` |
