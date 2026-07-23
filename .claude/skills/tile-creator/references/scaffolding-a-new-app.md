<!-- owner: jyoung-q -->

# Scaffolding a new Poe tile

End-to-end workflow for creating a new app from a natural-language prompt. Scaffold → schema → UI → tests → ship.

---

## Step 1: Scaffold

Pick a template: `react`, `preact`, `solidjs`, `vanilla-js`, `phaserjs`. Pick `phaserjs` for real-time 2D games with sprites, world coordinates, or arcade physics — it ships with the Phaser 3 dep, vite configured to inline assets and dynamic imports for the Poe sandbox iframe, and a dynamic-import seam so happy-dom unit tests stay Phaser-free.

The `react`, `preact`, and `solidjs` templates ship Tailwind v4 preconfigured (`tailwindcss` + `@tailwindcss/postcss` deps, `postcss.config.js`, `@import "tailwindcss"` in `tile/styles.css`) — utility classes work out of the box. `vanilla-js` and `phaserjs` do not; if you need Tailwind there, wire it up the same way (deps + postcss config + `@import "tailwindcss"` in `tile/styles.css`) before relying on utility classes, otherwise they will silently render as no-op strings.


```bash
poe-tiles tiles init <name> --template <t>
cd <name> && bun install
```

### Generated files

```
<name>/
├── tile/                      # entry point + backend wiring
│   └── src/
│       ├── entry.tsx          # Poe.setupStore(clientConfig); await store.waitForBootstrap(); render UI
│       └── backend.ts         # re-exports tileBackendConfig as default
├── synced-store/              # store contract
│   ├── data/
│   │   └── items.ts           # shared read helpers + table/read ctx types
│   ├── schema.ts
│   ├── mutators/
│   │   ├── index.ts           # compose exported mutator map
│   │   ├── remove-todo.ts
│   │   ├── set-todo.ts
│   │   └── types.ts
│   ├── mutators.test.ts       # colocated unit tests
│   ├── client-config.ts
│   └── backend-config.ts
├── ui/                        # store-agnostic components
│   ├── App.{tsx,ts}
│   └── App.test.happydom.tsx  # colocated UI tests
├── tests/                     # e2e (Playwright) + setup-dom helper
├── scripts/doctor.sh          # toolchain health check
├── client.ts                  # client-safe re-exports
├── package.json
├── tsconfig.json
├── vite.config.ts
└── playwright.config.ts
```


---

## Step 1.5: Verify scaffold

```bash
cd <app-dir>
bun run test:all
```

Treat a fired timeout as a real failure — find/fix the hanging test, don't extend the limit. `test:all` chains `type-check → test → build → playwright install → test:playwright`.

---

## Step 2: Schema and mutators

Read `@../synced-store/SKILL.md` **now** before continuing — Step 2 depends on it.

**Walk every cross-turn / cross-player handoff and pick a visibility tier per piece of state.** Skipping this is the #1 cause of mid-implementation rewrites.

Tiers:
- **Public** (`ctx.table(...)`) — synced to everyone in the instance.
- **Per-user private** (`ctx.privateOfUser(userId).table(...)`) — role/user-specific (active player's input, in-flight LLM prompt, drafts).
- **Server-only** (`ctx.serverOnly().table(...)`) — secrets the server uses but never exposes (answer keys, RNG seeds).

Don't design around tiers with client-side hiding/encryption — synced-store enforces at the server boundary.

**Before writing schema**, list every table with its tier AND every cross-player handoff with the table backing it; state the design to the user for confirmation. For turn-based games answer:
- Active player's view this turn? → typically `privateOfUser(activePlayer)` written by the prior player's mutator.
- Mid-turn state surviving refresh (e.g. in-flight bot call)? → `privateOfUser(self)`, NOT sessionStorage / component state.
- Hidden during play, revealed at end? → `serverOnly()` during play, copied to public on reveal.
- Stalled turn policy? → ask whether the game should wait indefinitely or let another player activate a skip after an inactivity deadline. If skippable, confirm the tile-specific duration and result of skipping before designing the schema; do not assume that a seconds-long party game and a many-hours asynchronous game share a timeout.
- Player leaves the room? → distinguish explicit membership removal from closing the tile or disconnecting, which must preserve resumable state. Decide whether `onRemoveUser` can remove the seat and repair turn order, teams, and win conditions without breaking fairness. If not, model a durable resolution state where the remaining players choose a new match or a game-specific alternative; do not silently choose for them.

If any answer is "figure out later," figure it out now.

Either keep generic `app*` names (simplest) or rename across `synced-store/*` + `client.ts` + `tile/src/entry.{tsx,ts}` + `tile/src/backend.ts` + `ui/App.{tsx,ts}` together.

Lift **patterns** from a reference app, not code: lobby+slot shape, `onAddUsers` / `onRemoveUser` hooks (wired in `backend-config.ts`), turn-validation order (throw BEFORE `if (!ctx.isServer) return`), `entries().toArray()` returning `[EntryKey, T]` with `EntryKey.itemKey: string`, `store.query(tx => tx.userId)` for user id.

---

## Step 3: UI

Replace the stub in `ui/App.{tsx,ts}`.

- `App` receives `{ store }` prop. `store.subscribe()` for reads, `store.mutate.<name>()` for writes.
- Semantic HTML IDs on interactive elements (Playwright targets).
- Don't import from `poe-tiles-sdk` in the UI — only use the `store` prop.
- `store.userId` is not exposed at the top level. Read via `store.query(async (tx) => tx.userId)`.
- `store.subscribe(tx => tx.table("foo").entries().toArray(), entries => ...)` returns `Array<[EntryKey, T]>`. Destructure as `[k, v]`, key is `k.itemKey` (NOT `as string`).
- **Avatars + names from `$userInfo`.** Pull from the `$userInfo` system table — never raw user IDs. Pair `$users` membership with `$userInfo` lookup. Subscribe once, build `Map<userId, PoeUserInfo>`:

  ```ts
  // PoeUserInfo (from @poe/synced-store-system-mutators): { userId, username, displayName, profilePicture, isDev? }
  // displayName / profilePicture are required strings but may be EMPTY — always fall back.
  store.subscribe(
      (tx) => tx.table("$userInfo").entries().toArray(),
      (entries) => {
          const next = new Map<string, PoeUserInfo>();
          for (const [, v] of entries) next.set((v as PoeUserInfo).userId, v as PoeUserInfo);
          setUserInfo(next);
      },
  );
  // <img src={info.profilePicture || PLACEHOLDER} alt={info.displayName || info.username} />
  // Name fallback: displayName, then username, then a NEUTRAL label ("Player") —
  // never the raw userId. A not-yet-resolved member profile can carry internal
  // ids (`u_<hex>` / `private-...`) in displayName/username; skip those too:
  // const usable = [info?.displayName, info?.username].find(
  //   (v) => v && !/^u_[0-9a-f]{32}$/.test(v) && !v.startsWith("private-"),
  // );
  ```

  Use `||` not `??` so empty strings fall through.
---

## Step 4: Mutator tests

Complete the UI before writing UI tests. Mutator tests bind to schema (Step 2), so write those now; happy-dom + Playwright wait until Step 5. UI churns fast Steps 2–3 — UI tests against in-flux UI get rewritten 3–5×.

Blank-mode test files = `test.todo()` placeholders + page-loads smoke. Tests colocated with source:

- **`synced-store/mutators.test.ts` (now)** — `createPoeTileTestHarness` unit tests; create / update / delete / edge cases. Easily hits high coverage on `synced-store/`.
- **`ui/App.test.happydom.tsx` (Step 5)** — happy-dom UI tests render `<App>` with a harness store. **Only tests counting toward `ui/App.tsx` diff coverage** (Bun `--coverage` skips browser code).
- **`tests/e2e.test.playwright.ts` (Step 5)** — Playwright E2E with `TestServer`. Lives in `tests/` (not colocated). Each test: wait for a visible UI element, `waitForBlobFrame(page)` for the iframe, unique `instanceId`.

**With substantial UI: write one happy-dom test per major UI state** (lobby / playing / generating / reveal). Without these, `bun run pre-commit` passes locally but CI's `check-diff-coverage` (80% threshold) fails — `App.tsx` routinely lands 30–50% with only a lobby test, and merging requires a human-attested oath in the PR description. One assertion per state is enough; drive transitions via `store.mutate.<...>` (faster, deterministic) or DOM clicks.

**E2E note:** Multi-client E2E tests (e.g., "alice draws, bob sees it") need synced-store backend bundles in the SDK tarball. If cross-client sync fails with `ENOENT: synced-store-backend.js`, republish with `bun run publish-tar` from `packages/poe-tiles-sdk/`. Single-client E2E always works.

---

## Step 5: UI tests + full check

UI is functionally complete. Write:
1. **Happy-dom** in `ui/App.test.happydom.tsx` — one assertion per major UI state.
2. **Playwright E2E** in `tests/e2e.test.playwright.ts` — main user flows.

Then:
```bash
cd <app-dir>
bun run test:all
```

Same `timeout: 90000`. Iterate until green.

If the tile has an `input`, `textarea`, or `[contenteditable]`, browser E2E is not sufficient to verify iOS keyboard layout. Open the tile in the actual iOS app, focus every editable control, and confirm that both the control and its primary action remain visible; docked chrome or a bottom sheet must move with the keyboard, and dismissing it must restore the layout without an extra gap.
---

## Step 5.5: Fill in app metadata

**Fill in the listing-page metadata yourself — do not ask the user.** The scaffold ships text fields as `TODO` placeholders and cannot infer the supported player count. Derive every value from what the app actually does (its `synced-store/schema.ts`, `ui/App.*`, and the original prompt). After this step there must be zero literal `TODO` strings in the text metadata.

1. **`README.md`** — long description rendered on the app's landing page. Rewrite the scaffold stub as a **short, player-facing description**: 2–4 sentences of prose, written for someone deciding whether to play, derived from the app's actual behaviour (schema/UI). Just the title + the paragraph — **no** `## What you can do` bullet list and **no** `## Built on Synced-Store` section. Keep under 16 KiB UTF-8.

2. **`.poe-tile.json` → `shortDescription`** — replace the placeholder with one specific sentence (≤140 chars). Say what the user does in the app, not what the app "is for". Examples: *"Online chess for two players."*, *"Shared todo list synced across devices."*, *"Real-time multiplayer draw-and-guess party game."* Avoid leading filler like *"An app to…"*.

3. **`.poe-tile.json` → `players`** — for every game or participant-count-sensitive tile, declare the supported player-count facet. Count total seats, including humans and AI; derive the values from the rules and capacity the app actually implements, not the number of people currently in the room or a test fixture.

   - Set `min` to the fewest participants needed for a meaningful session.
   - Set `max` when the rules, board, seats, or performance impose a real upper bound. For an exact two-player game, use `{ "min": 2, "max": 2 }`. Omit `max` only for a genuinely open-ended party, collaborative, or shared-leaderboard experience.
   - Add `recommended: { min, max }` only when a narrower range is materially better than the full supported range (for example, a party game that supports 3–12 but plays best with 5–8). Keep it within the supported range.
   - Omit `players` for utilities where participant count does not describe the experience. Do not publish `players: null` for a new tile; `null` is only the explicit clear sentinel when republishing an existing tile.

4. **`.poe-tile.json` → `profilePicture`** — generate and commit a dedicated square icon that reflects the tile's actual theme and visual identity, then point `profilePicture` at the committed PNG/JPG/WEBP file (≤512 KB). Do not leave the scaffold's starter image or omit the field on a first publish. Use an available image-generation tool when appropriate, and inspect the final file rather than trusting the prompt output.
   **The icon art must be full-bleed: a square image with opaque, edge-to-edge artwork — no baked-in rounded corners, no transparent margin, no framing border.** The listing/detail card renders the icon with `object-cover` inside an `overflow-hidden` rounded shell, so the *card* supplies the rounded corners. An icon that bakes in its own rounded background (transparent corners around a rounded rect) renders as a rounded card inside the card's rounding → a visible "double-rounded", inset look, unlike well-behaved tiles whose square art rounds cleanly at the card edge. When generating icon art (e.g. via an image model), prompt for a flat, edge-to-edge square with the subject filling the frame — not an "app icon" (image models default to drawing the rounded-rect chrome themselves).

   If the tile's UI itself is the strongest icon, generate a 720x720 square UI capture with `bun run regenerate-screenshot`, update `.poe-tile.json → profilePicture` to `./assets/screenshot.png`, and commit the file. The test loads the tile inside the iframe sandbox and writes that file. If the default `body` readiness check produces a blank or half-rendered image, edit `tests/screenshot.test.playwright.ts` to wait for a specific selector (matching what the existing `e2e.test.playwright.ts` waits for is usually the right move). For canvas/3D apps, expose a deterministic scene-ready marker after the first rendered frame and wait for that marker. Re-run after meaningful UI changes only if the screenshot is being used as `profilePicture`.

   **Mobile viewport / DPR.** The scaffold sets `viewport: { width: 360, height: 360 }, deviceScaleFactor: 2`. The CSS viewport stays under Tailwind's `sm` breakpoint (640px) so apps render their true mobile layout (single column, no desktop side-panels), while the 2x DPR still produces a 720x720 PNG. Do not raise the CSS width to 720+ to "see more" — that triggers `sm:`/`md:` styles and the captured image will misrepresent the mobile app.

5. **`.poe-tile.json` → `screenshots`** — capture and commit 1–3 representative gallery images (each PNG/JPG/WEBP ≤512 KB), then add their ordered paths to the manifest. At least one image must show genuine gameplay or a meaningfully populated primary state — not merely a title screen, empty lobby, pristine starting board, or first frame. Add a setup/start image only when it explains something the in-action image cannot. Inspect the final crops for loading indicators, debug UI, host chrome, clipping, and stale content.

Then verify: `grep -rn 'TODO' README.md .poe-tile.json` should return nothing. Only after that proceed to Step 6.

---

## Step 6: Publish

Run the workspace doctor, then build + publish using a browser-login session from `poe-tiles login`:

```bash
cd <app-dir> && bun run doctor
cd <app-dir> && bun run publish-to-poe-tiles
```

If the doctor reports missing publish auth, run `poe-tiles login` and wait for the user to approve the browser prompt. Do not ask first-time creators to paste a Poe API key into chat. `POE_TILES_SESSION_TOKEN` and legacy API keys are still supported for automation, but they are not the primary creator path.

Report the `appUrl` from the output as a clickable markdown link the user can try.

---


---

## Final step: Report

```
## App Scaffolded

**Name:** <app-name>
**Location:** poe-tiles/<app-name>
**Draft PR:** <PR URL from /commit>

### What it does
<1-2 sentence summary>

### Tests
- Type check: passing
- Unit tests: X passing
- E2E tests: X passing
```
