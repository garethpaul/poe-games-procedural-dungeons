<!-- owner: kevlu94 -->
# Migrating a pre-rename app

The platform was renamed from "app platform" to **Poe Tiles**. Apps scaffolded
before the rename hit a cluster of breakages that look unrelated but share one
cause. Work through this checklist top to bottom — each item is something an
old scaffold discovers by failure otherwise.

## 1. Upgrade the CLI first

Old CLI builds talk to retired hosts and removed subcommands. Self-upgrade
still works (the legacy docs host 301-redirects the upgrade manifest):

```bash
poe-tiles upgrade
```

If the old binary can't even self-upgrade, reinstall from the
[current install snippet](cli.md#installing-from-a-published-tarball).

## 2. `poe-tiles apps …` → `poe-tiles tiles …`

The `apps` subcommand family was renamed to `tiles` (`poe-tiles tiles publish`,
`tiles list`, `tiles init`, …). Any script or muscle memory using
`poe-tiles apps publish` now fails with an unknown-command error.

## 3. `publish-to-app-platform` → `publish-to-poe-tiles` script

Old scaffolds have this in `package.json`:

```json
"publish-to-app-platform": "bun run build && poe-tiles apps publish"
```

Replace it with the current form (`poe-tiles doctor` checks for exactly this
script name and fails on the old one):

```json
"publish-to-poe-tiles": "bun run build && poe-tiles tiles publish"
```

## 4. `poeApp()` → `poeTile()` in `vite.config.ts`

The Vite plugin was renamed; the `poeApp` compatibility alias has been
removed, so old configs fail at build time with an import error. Update:

```ts
// Before
import { poeApp } from "poe-tiles-sdk/vite";
export default defineConfig({ plugins: [poeApp()] });

// After
import { poeTile } from "poe-tiles-sdk/vite";
export default defineConfig({ plugins: [poeTile()] });
```

(Related renames if you referenced them: `PoeAppPluginOptions` →
`PoeTilePluginOptions`, `POE_APP_EXTERNALS` → `POE_TILE_EXTERNALS`.)

## 5. Upgrade the app's SDK pin

The renames above ship in newer SDK tarballs, and an old pin will keep
resurfacing them (plus miss newer APIs). See
[Upgrading an existing app's SDK](cli.md#upgrading-the-sdk-in-an-existing-app).

## 6. Verify

```bash
poe-tiles doctor && bun run build && bun run publish-to-poe-tiles
```

`doctor` passing plus a clean build and publish means the migration is
complete. If something still fails, check the
[troubleshooting page](troubleshooting.md).
