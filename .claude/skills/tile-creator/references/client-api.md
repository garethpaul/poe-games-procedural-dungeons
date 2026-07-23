<!-- owner: jyoung-q -->
# Client API

The `poe-tiles-sdk/v1/client.js` module is the client-side JavaScript interface for apps running inside Poe canvas frames. It provides store initialization, data access, and bot interaction — all from your app's frontend code.

::: info Docs describe the latest SDK
This reference tracks the most recently published `poe-tiles-sdk` tarball. If a documented method doesn't exist in your app (TypeScript error, or `undefined` at runtime), your app's SDK pin is older than the docs — see [Upgrading an existing app's SDK](cli.md#upgrading-the-sdk-in-an-existing-app). Recently introduced APIs carry an *Added &lt;date&gt;* note so you can tell at a glance.
:::

```typescript
import { createPoe, PostMessageEnvironment, registerPoeTileElement } from "poe-tiles-sdk/v1/client.js";
```

## Client APIs

- [`Poe.setupStore()`](#poe-setupstore) — Initialize a synced store
- [`Poe.store`](#poe-store) — Access the SyncedStoreClient after setup
- [`Poe.stream()`](#poe-stream) — Stream a response from a Poe bot
- [`Poe.call()`](#poe-call) — Call a bot with automatic tool execution
- [`Poe.createTool()`](#poe-createtool) — Define a tool for use with `Poe.call()`
- [`Poe.listModels()`](#poe-listmodels) — List available Poe models
- [`Poe.getPoeBotAccess()`](#poe-getpoebotaccess) — Whether the user can make Poe-backed bot/agent calls
- [`Poe.requestPoeBotAccess()`](#poe-requestpoebotaccess) — Same check, but the platform prompts the user to fix a blocked verdict (inline Poe-account linking)
- [`Poe.getBundleAssetUrl()`](#poe-getbundleasseturl-path) — Get a blob URL for a bundled asset
- [`Poe.tiles.list()`](#poe-tiles-list) — List all published apps
- [`Poe.tiles.get()`](#poe-tiles-get-typeid) — Fetch one published app by typeId
- [`Poe.tiles.search()`](#poe-tiles-search-query-limit) — Search the public app catalog
- [`Poe.tiles.preload()`](#poe-tiles-preload-typeid-instanceid) — Preload an app's bundle for instant loading
- [`Poe.tiles.syncStatus()`](#poe-tiles-syncstatus-typeid-instanceid) — Creation-lifecycle sync status of an instance on this device (subscribable)
- [`Poe.open()`](#poe-open-typeid-instanceid-openprops-isnew-placement-viewwidth) — Navigate to a different app (or open it in split view alongside the caller)
- [`Poe.showTileLauncher()`](#poe-showtilelauncher) — Ask the host to show the standard tile launcher
- [`Poe.users.openProfile()`](#poe-users-openprofile-userid-username) — Open a user's profile UI in the host
- [`Poe.room.openInvitePicker()`](#poe-room-openinvitepicker) — Open the host Add members invite surface for the calling app instance
- [`Poe.room.openChat()`](#poe-room-openchat) — Reveal the containing room's chat in the host-native surface
- [`Poe.room.pickMembers()`](#poe-room-pickmembers) — Pick room members, optionally adding contacts to the room first
- [`Poe.room.tileEnd()`](#poe-room-tileend-input) — Show the host end-of-tile UI and optionally replay
- [`Poe.room.setShareLeaderboardId()`](#poe-room-setshareleaderboardid-leaderboardid) — Make current-page share links point at a tile-owned leaderboard
- [`Poe.room.dismissTileEnd()`](#poe-room-dismisstileend-opts) — Programmatically dismiss this client's tile-end overlay (shared-instance team games)
- [`Poe.agents.create()`](#poe-agents-create-agentid-name-model-tools-room) — Create an agent owned by the calling user, optionally adding it to a room
- [`Poe.agents.addToRoom()` / `Poe.agents.removeFromRoom()`](#poe-agents-addtoroom-agentid-typeid-instanceid--poe-agents-removefromroom-agentid-typeid-instanceid) — Add/remove an existing agent as a room member
- [`Poe.agents.listTools()`](#poe-agents-listtools) — List the first-party agent system-tool catalog
- [`Poe.agents.listTemplates()`](#poe-agents-listtemplates) — List the first-party agent-template catalog
- [`Poe.agents.listMine()`](#poe-agents-listmine) — List your own live agents
- [`Poe.track()`](#poe-trackevent-properties) — Send a privacy-filtered analytics event
- [`Poe.openExternalUrl()`](#poe-openexternalurl-url) — Open a web link via the host (platform links navigate in place; other links need user confirmation)
- [`Poe.openSettings()`](#poe-opensettings-section) — Ask the host to open its Settings page
- [`<poe-tile>`](#poe-tile-custom-element) — Embed a child app inline
- [`Poe.getOpenProps()`](#poe-getopenprops) — Read data passed by a parent app
- [`Poe.consumeEntryContext()`](#poe-consumeentrycontext) — Read how the user reached the tile (push/banner/badge/direct) + the notification's entry context
- [`Poe.parent`](#poe-parent) — Parent store identity (for child apps)
- [`Poe.topOrigin`](#poe-toporigin) — Origin of the top (host) document, for building absolute URLs from sandboxed iframes
- [`Poe.haptics`](#poe-haptics) — Trigger cross-platform haptic feedback
- [`createVerticalScrollBounceMount()`](#createverticalscrollbouncemount) — Create a root render target with native vertical pull bounce
- [`installVerticalScrollBounce()`](#installverticalscrollbounce) — Add native vertical pull bounce to a custom scroll area
- [`isIosApp()`](#isiosapp) — Detect the iOS app WebView, including app iframes
- [`isAndroidApp()`](#isandroidapp) — Detect the Android app WebView, including app iframes
- [`notifyActivity()`](#notifyactivity) — Notify the manager of activity (preview, unread)
- [`setTurn()` / `clearTurn()`](#setturn-clearturn) — Declare whose turn it is (the "Your Turn" indicator)
- [`assertRoomMember()`](#assertroommember) — Server-side validation that a user is still in the caller's room
- [`notifyUsersAddedToTile()`](#notifyusersaddedtotile) — Standard room-aware "added/assigned to this tile" notification
- [`addInstanceToRoom()`](#addinstancetoroom) — Register an app instance as a member of a flat room
- [`getCurrentUserId()`](#getcurrentuserid) — Read the current user's userId from a store (UI/effect helper)

::: warning Poe Employee Note
Currently the platform injects an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap) into the app's `index.html` at serve time, which is what makes `import { createPoe } from "poe-tiles-sdk/v1/client.js"` work without a bundler. In the future we'll probably want creators to include a script tag instead (e.g. `<script src="https://poe.com/v1/poe-tiles-sdk.js"></script>`) so the mechanism is more explicit and doesn't require server-side HTML rewriting.
:::

## Background

Apps run inside sandboxed iframes. To ensure apps load even when offline, app bundles are not fetched over HTTP at runtime. Instead, the top document caches all bundle assets and serves them to the iframe via `postMessage`. This is why APIs like [`Poe.getBundleAssetUrl()`](#poe-getbundleasseturl-path) exist — they request assets from the top document's cache and return blob URLs, rather than making network requests.

## Initialization

Every app must explicitly create a Poe instance before using any APIs:

```javascript
import { createPoe, PostMessageEnvironment, registerPoeTileElement } from "poe-tiles-sdk/v1/client.js";

const environment = new PostMessageEnvironment();
const Poe = createPoe({ environment });

// Only needed if your app uses <poe-tile> to embed other apps
registerPoeTileElement(environment);
```

`createPoe()` returns the Poe API object and automatically registers it as the module-level singleton, so code-split chunks can access it. Pass `{ singleton: false }` to disable this (useful in tests).

## Core APIs

### `Poe.setupStore()`

Initialize a synced store inside your app.

```javascript
async function addTodo(ctx, input) {
  await ctx
    .table("todos")
    .set({ itemKey: input.id, value: { text: input.text, done: false } });
}

const store = Poe.setupStore({ mutators: { addTodo }, schemaVersion: 1 });
await store.waitForBootstrap();
// render UI
```

`await store.waitForBootstrap()` before rendering UI. It resolves as soon as authoritative data is ready from *either* local cache or first server pull, so offline-capable launches (cached instance, or a fresh instance declared via `Poe.tiles.prepareNewInstances`) unblock immediately. Don't use `waitForServerData()` here — it always waits for a server pull, which stalls offline launches and brand-new prepared instances that have no server state to fetch. Reserve `waitForServerData()` for tests and Node-side scripts.

### `Poe.store`

A [`SyncedStoreClient`](../../synced-store/references/client-api-reference.md) reference. Available after calling `setupStore()`.

### `Poe.stream()`

Stream a response from a Poe bot. Returns an async iterator that yields partial message chunks as they arrive.

```javascript
for await (const chunk of Poe.stream({
  botName: "Claude-3.5-Sonnet",
  prompts: "What is the capital of France?",
})) {
  console.log(chunk.text);
}
```

`prompts` can be a string, a single message object `{ role, content }`, or an array of either.

::: tip Check bot access before calling
Bot calls need a usable Poe account. Preflight with [`Poe.requestPoeBotAccess()`](#poe-requestpoebotaccess) — which prompts the user to fix a blocked account (link / reconnect / enable points) right in place — or [`Poe.getPoeBotAccess()`](#poe-getpoebotaccess) for a silent check, **before** calling `stream()` or `call()`. An unguarded call from a blocked user rejects with a `PoeBotAccessError` instead of streaming, which reads as a cryptic failure unless you've handled it.
:::

::: warning Poe Employee Note
`Poe.stream()` is not thoroughly tested outside of unit tests and may have rough edges.
:::

### `Poe.call()`

Call a bot with automatic tool execution. Like `stream()`, but runs an agentic loop — when the bot emits tool calls, they are executed automatically and the results are fed back until the bot produces a final response. Like `stream()`, it requires Poe bot access — preflight with [`Poe.requestPoeBotAccess()`](#poe-requestpoebotaccess) (see the tip above) so a blocked user gets the account prompt instead of a cryptic rejection.

```javascript
const weatherTool = Poe.createTool({
  name: "get_weather",
  description: "Get current weather for a city",
  parameters: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  },
  run: async ({ city }) => `Weather in ${city}: 72F sunny`,
});

for await (const event of Poe.call({
  botName: "GPT-4o",
  prompts: "What's the weather in Tokyo?",
  tools: [weatherTool],
  maxIterations: 10, // default
})) {
  console.log(event.text);
}
```

::: warning Poe Employee Note
`Poe.call()` is not thoroughly tested outside of unit tests and may have rough edges.
:::

### `Poe.createTool()`

Create an executable tool definition for use with `Poe.call()`. Tools define a JSON Schema for their parameters and a `run` function that returns a string result.

```javascript
const calculator = Poe.createTool({
  name: "calculate",
  description: "Evaluate a math expression",
  parameters: {
    type: "object",
    properties: { expression: { type: "string" } },
    required: ["expression"],
  },
  run: async ({ expression }) => String(eval(expression)),
});
```

::: warning Poe Employee Note
`Poe.createTool()` is not thoroughly tested outside of unit tests and may have rough edges.
:::

### `Poe.listModels()`

List all available Poe models. Returns an array of `Model` objects with metadata like `id`, `description`, `owned_by`, `architecture`, `pricing`, and `context_window`.

```javascript
const models = await Poe.listModels();
console.log(models.map(m => m.id)); // ["Claude-3.5-Sonnet", "GPT-4o", ...]
```

Use this to discover valid bot names for `Poe.stream()` / `Poe.call()`, or to build a model picker UI.

### `Poe.getPoeBotAccess()`

Check whether the current user can make Poe-backed bot/agent calls right now, and if not, why. Returns a discriminated union — `{ canUse: true }` or `{ canUse: false; reason }` — so `reason` is present exactly when access is blocked. Only the verdict, never the user's Poe API key.

```javascript
const access = await Poe.getPoeBotAccess();
if (!access.canUse) {
  // access.reason is one of:
  //   "poe_link_required"            — no Poe account linked
  //   "poe_relink_required"          — the link expired; reconnect
  //   "poe_pay_with_points_required" — linked, but Poe points aren't enabled
  //   "poe_bot_backend_unavailable"  — Poe-backed bots are unavailable here
  // Guide the user to fix it (e.g. open settings) instead of letting the call fail.
}
```

Poe-backed bot/agent calls need a usable Poe account. Use this to gate those features up front — and surface the specific `reason` — instead of letting the call fail server-side. For the version that also prompts the user to fix a blocked verdict, use `Poe.requestPoeBotAccess()` below.

### `Poe.requestPoeBotAccess()`

*Added 2026-07-22 — [upgrade your SDK](cli.md#upgrading-the-sdk-in-an-existing-app) if your pin predates this.*

Like `getPoeBotAccess()`, but when access is blocked the **platform prompts the user to fix it** — a host-owned modal with the reason-specific copy and inline Poe-account linking. Pasting an API key completes without leaving your tile (the promise resolves `{ canUse: true }`, so you can continue the bot call in the same gesture); the "Sign in to Poe" path is a full-page redirect that returns to the current page, so re-run your preflight on mount. Dismissal resolves `{ canUse: false, reason }`.

```javascript
async function askAi(prompt) {
  const access = await Poe.requestPoeBotAccess();
  if (!access.canUse) return null; // user declined — keep the feature visible, disabled

  let text = "";
  for await (const chunk of Poe.stream({ botName: "Claude-Sonnet-4.5", prompts: prompt })) {
    if (chunk.text) text = chunk.text;
  }
  return text;
}
```

Prefer this over hand-rolling a "link your Poe account" prompt. Use `getPoeBotAccess()` when you only want to *silently* adapt UI (e.g. render a hint) without ever popping the platform modal.

If you skip the preflight, a blocked `Poe.stream()` / `Poe.call()` rejects with a typed `PoeBotAccessError` whose `reason` matches the union above (import `isPoeBotAccessError` from the SDK) — catch it and call `requestPoeBotAccess()` to recover.

### `Poe.getBundleAssetUrl(path)`

Get a URL for a static file from the app's bundle. Returns a blob URL that works both online and offline — the asset is fetched via the parent frame's cache, so it's available even when there's no network connection.

This is how apps reference uploaded assets (images, JSON data, additional JS modules, etc.) in a way that works inside the sandboxed iframe environment.

```javascript
// Load an image from the bundle
const url = await Poe.getBundleAssetUrl("assets/hero.png");
document.querySelector("img").src = url;

// Fetch a JSON data file from the bundle
const url = await Poe.getBundleAssetUrl("data/levels.json");
const levels = await fetch(url).then(r => r.json());

// Load a JS file from the bundle
const url = await Poe.getBundleAssetUrl("my-module.js");
const code = await fetch(url).then(r => r.text());
```

**Path formats:** Bare paths (`assets/hero.png`), leading slash (`/assets/hero.png`), and relative paths (`./assets/hero.png`) all work.

**Caching:** Repeated calls for the same path return the same blob URL without refetching.

### `Poe.tiles.list()`

List published apps with cursor pagination. Returns `{ tiles, nextCursor? }`, where `tiles` is an array of `Tile` objects with `id`, `handle`, `creator_id`, `creator_handle`, `created_at`, and `updated_at`.

```javascript
const page1 = await Poe.tiles.list({ limit: 20 });
console.log(page1.tiles.map(a => a.handle));

if (page1.nextCursor) {
  const page2 = await Poe.tiles.list({ cursor: page1.nextCursor, limit: 20 });
  console.log(page2.tiles.map(a => a.handle));
}
```

Use this to discover available apps or build an app directory UI.

**Parameters:**
- `limit` — max hits, 1..200 (defaults to 20 server-side)
- `cursor` — opaque cursor from the previous page
- `creatorHandle` — restrict results to a single creator

### `Poe.tiles.get({ typeId })`

Fetch one published app by typeId. Use this when you already have a persisted app reference and need display metadata; it avoids loading the full catalog.

```javascript
const app = await Poe.tiles.get({ typeId: "todo-list" });
console.log(app.handle);
```

**Parameters:**
- `typeId` — app type ID (`Tile.id`)

**Caching:** Each `typeId` is cached persistently in the host with a 5-minute stale time — cached tiles stay readable offline.

### `Poe.tiles.getByHandle({ creatorHandle, tileHandle })`

Resolve one published app by creator handle + app handle (detail-quality payload including `long_description` and `media`). Same caching and reactive affordances as `Poe.tiles.get`.

### Reactive reads: `Poe.query(ref)`

Cacheable reads (`Poe.tiles.get`, `Poe.tiles.getByHandle`, `Poe.tiles.list`) also expose `.query(input)` and `.key(input)` for reactive UI. Build a ref, then subscribe: the cached value arrives immediately (even offline), followed by a fresh snapshot when the host revalidates.

```javascript
const ref = Poe.tiles.get.query({ typeId: "todo-list" });
const unsubscribe = Poe.query(ref).subscribe((snapshot) => {
  render(snapshot.data, {
    isStale: snapshot.isStale,
    isRevalidating: snapshot.isRevalidating,
    error: snapshot.error,
  });
});
```

The controller also offers `read()` (one snapshot, never fetches), `watch()` (`for await` sugar over the same stream), and `refetch()` (force a network fetch). SolidJS apps can use `createPoeQuery` from `poe-tiles-sdk/v1/solid` instead of hand-wiring `subscribe`.

Per-call cache overrides ride the second argument of the imperative call: `Poe.tiles.get({ typeId }, { cache: { behavior: "cache-only" } })`. Behaviors: `stale-while-revalidate` (default), `cache-first`, `network-only`, `cache-only` (throws on a cache miss instead of fetching).

### `Poe.tiles.search({ query, limit? })`

Full-text search the public app catalog by handle / creator handle. Returns full `Tile` records — same shape as `Poe.tiles.list()` — so you can render avatars and descriptions without a second round-trip.

```javascript
const matches = await Poe.tiles.search({ query: "chess", limit: 10 });
console.log(matches.map((a) => a.handle));
```

**Parameters:**
- `query` — search string (1..500 chars after trim)
- `limit` — max hits, 1..50 (defaults to 20 server-side)

**Caching:** Each `(query, limit)` pair is cached in the host for 5 minutes, so debounced retypes of the same query are served from memory.

### `Poe.tiles.preload({ typeId, instanceId? })`

Preload an app's bundle so that a subsequent `<poe-tile type-id="...">` loads instantly. The top document fetches all bundle files and caches the self-contained HTML template in IndexedDB.

```javascript
// Preload an app you know the user is likely to open
await Poe.tiles.preload({ typeId: "my-game" });

// Preload with an instance ID (reserved for future use)
await Poe.tiles.preload({ typeId: "my-chat", instanceId: "room-42" });
```

### `Poe.tiles.syncStatus({ typeId, instanceId })`

Creation-lifecycle sync status of one tile instance **as known on this device**. Pure local read — never a network request — so it works offline and for instances that are not currently rendered.

Returns `{ status }` with one of three values (monotonic per device):

- `"unknown"` — no local record of the instance on this device. It may still exist server-side; a local client cannot know.
- `"local-only"` — created locally (e.g. offline via `Poe.tiles.prepareNewInstances` or an optimistic first mutation) but the server has not yet confirmed the instance exists. **This is normal offline operation that reconciles automatically on reconnect — never render it as an error.** A subtle "waiting to sync" hint is appropriate at most.
- `"server-confirmed"` — the server has confirmed the instance (at least one server-verified commit landed on this device).

Pending mutations *after* creation do not change the status — this API tracks creation lifecycle only, not "are all my edits flushed" (use `store.getPendingMutations()` / `store.onPendingMutationsChanged` for that).

```javascript
const { status } = await Poe.tiles.syncStatus({
  typeId: "my-game",
  instanceId: "match-42",
});
```

Subscribe to changes with `Poe.query` (same reactive contract as `Poe.tiles.get.query`):

```javascript
const ref = Poe.tiles.syncStatus.query({ typeId: "my-game", instanceId: "match-42" });
const unsubscribe = Poe.query(ref).subscribe((snapshot) => {
  if (snapshot.data) updateSyncBadge(snapshot.data.status);
});
// later: unsubscribe();
```

Snapshots stream as the status changes; consecutive snapshots may repeat a status, so compare `snapshot.data.status` before reacting. The direct call always recomputes from local storage, so it is never stale.

### `Poe.open({ typeId, instanceId, openProps?, anchorSortKey?, placement?, viewWidth? })`

Navigate the root app to a different app. This is how a sub-app requests the platform to switch to another app at the top level (as opposed to embedding it inline with `<poe-tile>`).

To open a store that has **never existed before**, first declare its genesis with [`Poe.tiles.prepareNewInstances`](#poe-tiles-preparenewinstances-instances) and await it — there is no `isNew` parameter on `Poe.open`.

```javascript
// Open another app, passing data via openProps
await Poe.open({
  typeId: "my-game",
  instanceId: "lobby-123",
  openProps: { inviteCode: "abc123" },
});

// Open a large synced-store app around a known sortKey.
await Poe.open({
  typeId: "chat",
  instanceId: "room-42",
  anchorSortKey: "msg/042",
  openProps: {
    openedSearchResult: {
      itemKey: "message-042",
      tableName: "messages",
      sortKey: "msg/042",
    },
  },
});

// Open the target alongside the caller in a split layout on desktop. On
// mobile, this falls through to a normal forward navigation, so the same
// call works on every form factor without branching in app code.
await Poe.open({
  typeId: "my-canvas",
  instanceId: "canvas-for-chat-42",
  placement: "splitView",
  viewWidth: "260px", // caller's pane width; opened app fills the remainder
});
```

The opened app reads the data via `Poe.getOpenProps()`. By default `Poe.open()` replaces the current view (the root app navigates to the target). Pass `placement: "splitView"` to ask the root to render the target alongside the caller; on roots that do not support split view, or on narrow viewports where there is no room for two panes, the hint is ignored and the call behaves like a normal navigation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `typeId` | string | Yes | The app type ID to open |
| `instanceId` | string | Yes | Instance ID for the app's store |
| `openProps` | JSONValue | No | JSON-serializable data passed to the opened app (readable via `Poe.getOpenProps()`) |
| `anchorSortKey` | string | No | Sort key used by outward pull windows in the opened app. Use it with app-specific `openProps` when you need both store-level anchoring and UI-level context/highlighting. |
| `placement` | `"current" \| "splitView"` | No | `"current"` (default) replaces the root view. `"splitView"` opens the target alongside the caller on roots that support a split layout (e.g. the manager's two-column layout on desktop and tablets); phones in any orientation and other narrow / unsupported form factors ignore the hint and behave like `"current"`. |
| `viewWidth` | string | No | CSS length in `px` or `%` controlling the *caller's* pane in the split layout (e.g. `"260px"`, `"30%"`). Other units (`rem`, `em`, `vw`, `calc(...)`, etc.) are rejected to keep the host-side parser tight; invalid values silently fall back to the default split. The opened app's pane takes the remaining space. Only meaningful with `placement: "splitView"`. Useful when the caller is a fixed-width picker/sidebar and wants the opened app to take the rest of the screen. |
| `room` | tagged union | No | Flat-room mode for the opened app. One of: `{ kind: "self" }` (opened app owns its own roster, standalone); `{ kind: "inherit" }` (opened app joins the caller's room — DEFAULT when omitted); `{ kind: "explicit", storeTypeId, instanceId }` (opened app joins an explicit room). See [`<poe-tile>` Attributes](#attributes) for the equivalent HTML form. |

Inside an iframe, the app reads its actual rendered size with `window.innerWidth` / `window.innerHeight` (and `ResizeObserver` for changes) — the `viewWidth` value is a hint for the host layout, not something the opened app needs to read directly.

### `Poe.tiles.prepareNewInstances({ instances })`

Declare `$bootstrapStore` genesis for one or more freshly-minted stores. **Await it BEFORE rendering the store (`<poe-tile>`) or `Poe.open`-ing it.** It only writes to durable per-instance client metadata (no network round-trip); the genesis actually runs when one of the stores is opened.

`instances` is an array of `BootstrapStoreSpec` entries for the whole gesture (the target plus any room/helper siblings). Each spec names `typeId`, `instanceId`, `room` (`self`, `rootGroup`, or `memberOf`, optional `parent`), an optimistic `PoeUserInfo[]` roster, and optional `roomMemberInstances`.

**Opening ANY one tile in the group creates ALL of them.** The opened store's session carries the persisted specs; the server resolves + validates the whole group's rosters and fans out `$bootstrapStore` genesis to every sibling (self-healing until all are pinned). You only need to open one.

#### Creating a new room with seeded membership

Use `prepareNewInstances` to create a new tile in a NEW room whose membership is seeded from specs you supply — the "rematch" pattern. Mint a new instanceId yourself, declare the genesis, then open the tile with `room: { kind: "self" }` when it owns its own room. Build a `BootstrapStoreSpec` from your own `$users` / `$userInfo` tables (available offline):

```javascript
// Rematch: same players, fresh game, fresh room.
const roster = await Poe.store.query(async (tx) => {
  const members = await tx.table("$users").scan().values().toArray();
  const userInfo = new Map(
    (await tx.table("$userInfo").scan().values().toArray()).map((info) => [
      info.userId,
      info,
    ]),
  );
  return members
    // Drop removed members, and drop agent members (`agent_*`): the server
    // resolves every seeded id through the central user directory, which
    // agents are not in, so a listed agent is dropped from the new room. Re-add
    // agents through the normal flow once the rematch opens.
    .filter((m) => m.removedAt === undefined && !m.userId.startsWith("agent_"))
    .map((m) => userInfo.get(m.userId))
    .filter((info) => info !== undefined);
});
// Use the portable `generateUUID()` helper, not `crypto.randomUUID()` — the
// latter is unavailable on non-secure LAN / dev origins (common for local and
// mobile testing) and would throw before `Poe.open()` runs.
const newInstanceId = generateUUID();
const selfRef = { typeId: MY_TYPE_ID, instanceId: newInstanceId };
// 1. Declare genesis (writes durable client metadata only).
await Poe.tiles.prepareNewInstances({
  instances: [
    {
      ...selfRef,
      room: { type: "self" },
      users: roster,
      roomMemberInstances: [selfRef],
    },
  ],
});
// 2. Open the tile — this drives the genesis for the whole group.
await Poe.open({
  typeId: MY_TYPE_ID,
  instanceId: newInstanceId,
  room: { kind: "self" },
  openProps: { rematch: { players: roster.map((user) => user.userId) } },
});
```

Semantics and rules:

- Every fresh store opened by the gesture needs a matching spec in `instances`. If you create a separate chat/room store plus an app store, include both: the room spec usually uses `room: { type: "self" }`, and the app spec uses `room: { type: "memberOf", room: roomRef }`.
- The caller must be included in each spec's `users`, and every listed user must already be an active member of the caller's room or the parent room. This is a same-membership primitive, not an invite primitive — to add NEW people afterward, use `Poe.room.pickMembers()`.
- Validation happens server-side when the request arrives. The server re-resolves profile data from the canonical user source, validates membership, and drops invalid seed entries into the rejected-bootstrap table instead of trusting client-supplied display data.
- **Works offline**: the seed survives reloads and long offline sessions. The kernel stores pending bootstrap specs in durable local metadata and replays creator context for the browser that created the instance until the server has applied the bootstrap.
- **Discovery is app-level.** Seeding gives users *access*; it does not put the new room in their sidebar. Announce it from a mutator (e.g. `notifyActivity` / `setTurn`) after opening, and pass the roster's display data via `openProps` so your UI can render players before the first sync.

#### Auto-replace semantics for `placement: "splitView"`

The split-view (right) pane has an owner. A subsequent `placement: "splitView"` call replaces it only when:

- the pane is empty, or
- the current pane was opened by a previous `placement: "splitView"` call (center-owned).

A pane the user opened manually from the host's UI (e.g. a "pin to side" menu) is treated as user-pinned and is preserved — the new call falls back to a plain forward navigation in the caller's pane and the user-pinned side is left alone. A plain `Poe.open()` (default `placement: "current"`) likewise leaves a user-pinned side pane intact.

### `Poe.showTileLauncher()`

Ask the host manager to render the standard tile launcher. The host owns catalog browsing/search UI, mints the selected tile instance and child room ids, dispatches `recieveTileStarted` on the calling store, then opens the selected tile. Cancel resolves `null`.

```typescript
const result = await Poe.showTileLauncher();
if (result) {
  console.log("Started", result.tileTypeId, result.tileInstanceId);
}
```

The calling app must call `Poe.setupStore()` before using this API so the SDK can tell the host which schema version to use for the callback mutation.

Implement a store mutator named `recieveTileStarted` (spelling intentional) to persist the launch in your app:

```typescript
type TileLauncherStartedInput = {
  itemKey: string;
  tileTypeId: string;
  tileInstanceId: string;
  room: { storeTypeId: string; instanceId: string };
  parentRoom?: { storeTypeId: string; instanceId: string };
  timestamp: number;
};
```

For chat-style launchers, use `room` as the newly-created child room and validate `parentRoom` against the current store before writing any launch rows.

### `Poe.users.openProfile({ userId, username? })`

Ask the host to open a user's profile UI, for example from "Forwarded from Alice" attribution in a chat message.

```javascript
await Poe.users.openProfile({
  userId: "u123",
  username: "alice",
});
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | Stable user ID for the profile to open |
| `username` | string | No | Optional, tolerated hint only — the host resolves the profile from `userId`. The call never rejects on a missing `username`. Whether another user's profile can be opened is gated by the host's `viewOtherProfiles` capability (check `Poe.capabilities` before offering the affordance); the host drops an open it can't route. |

This is a UI navigation request only. It does not grant access to private profile data or bypass host-side permissions.

### `Poe.room.openInvitePicker()`

Ask the host to open its Add members invite surface for the calling app instance. Takes no parameters — the host resolves the caller's identity from the trusted RPC context (the app cannot forge it). The host resolves the caller's canonical room, lets the user add contacts to that room, and keeps share/copy invite links targeted at the calling tile instance.

```javascript
await Poe.room.openInvitePicker();
```

The call resolves after the host accepts the request to show the surface; it does not return selected contacts, added members, or copied-link status. Calling from the root app is rejected — the root app owns the invite UI directly and does not need an RPC hop.

### `Poe.room.openChat()`

Ask the host to reveal the chat for the calling tile's containing room. The method takes no parameters: the host derives the calling tile from trusted RPC context, resolves its canonical room, and opens chat in the layout-native surface (an accessory pane on wide manager layouts or a sheet on compact layouts). If that room chat is already visible, the request is a no-op that preserves its mounted state and scroll position. Calls from a tile that is not inside a chat room are ignored.

```javascript
await Poe.room.openChat();
```

Calling from the root app is rejected because the root already owns the chat surface.

### `Poe.room.pickMembers()`

Open the host's room member picker and return the selected room members. Existing room members are just selected. Child rooms show active parent-room users in a separate **People in parent room** section as existing room members unless the child has a local `$users` row for that user. Contacts are only shown when `addFromContacts: true`; selecting a contact adds them to the room before returning them. If the calling app is in a `dm-*` room, selecting contacts moves the app to a 1:1 DM or a new group room as needed instead of adding people to the frozen DM membership.

```typescript
const result = await Poe.room.pickMembers({
  title: "Choose player",
  addFromContacts: true,
  selection: { max: 1 },
  // `excludeUserIds` hides rows entirely — e.g. drop the current user, since a
  // "Sit here" affordance already covers seating yourself.
  excludeUserIds: [currentUserId].filter(Boolean),
  // Already-seated players stay visible but render as "Playing" and are not
  // selectable. Pass them as `playingUserIds`, NOT `excludeUserIds` — excluded
  // rows are filtered out before the "Playing" marker is applied, so seats put
  // in `excludeUserIds` would be hidden instead of shown as taken.
  playingUserIds: [game.whiteUserId, game.blackUserId].filter(Boolean),
});

const user = result?.users[0];
if (user) {
  await store.mutate.assignSeat({
    seatId: "black",
    userId: user.userId,
    notify: "default",
    now: Date.now(),
  });
}
```

Use `excludeUserIds` to hide users the app does not want selectable. Use `playingUserIds` to keep a room member visible but mark them as already `Playing`; those rows are not selectable. The picker also shows a share/copy invite-link footer by default — pass `shareLink: false` to hide it (e.g. a picker that should only choose existing members).

The result is `null` when the user cancels. Otherwise it includes the resolved room ref plus user snapshots:

```typescript
type RoomPickMembersResult = {
  room: { storeTypeId: string; instanceId: string };
  users: Array<{
    userId: string;
    username: string;
    displayName: string;
    profilePicture: string;
    source: "existingRoomMember" | "addedContact";
    addedToRoom: boolean;
  }>;
};
```

Treat the result as UI input, not authority. Mutators that write app state for a picked user should call `assertRoomMember(ctx, { userId })` on the server-authoritative pass before committing the assignment.

### `Poe.room.tileEnd(input)`

Ask the host to show the standard end-of-tile UI for a persisted leaderboard. The host derives the calling tile instance from trusted RPC context, subscribes to `getLeaderboard(ctx, { leaderboardId })` in that tile's synced store, and hydrates profiles. Ranked entries render first; every other active human room member is appended without a score in room join order, while agents are excluded. Optimistic mutator writes appear immediately and confirmed updates remain live while the sheet is open.

Because the end sheet opens immediately, a game must not call `tileEnd()` in the same moment it detects a terminal result. First keep the playfield visible long enough to finish the decisive animation and explain why the player won or lost, then leave a readable beat before calling this API. See [game UX best practices](./game-ux-best-practices.md) for the terminal-reveal sequence.

Persist scores and presentation from a tile-defined mutator with `setLeaderboard(...)` or `setLeaderboardScore(...)`; `tileEnd()` carries only the board id plus optional actions/round behavior. Use the same `leaderboardId` for writes, `getLeaderboard(...)` reads, and this call. If your page shows a persistent leaderboard without opening tile-end, call [`Poe.room.setShareLeaderboardId()`](#poe-room-setshareleaderboardid-leaderboardid) instead.

```typescript
const result = await Poe.room.tileEnd({ leaderboardId: "default" });
if (result.playAgain) {
  await store.mutate.startRound({});
}
```

```typescript
await store.mutate.finishRun({
  score: finalScore,
});

await Poe.room.tileEnd({
  leaderboardId: "daily",
});
```

```typescript
type RoomTileEndInput = {
  leaderboardId: string;
  round?: string;
  actions?: {
    playAgain?: boolean;
    review?: { label: string };
  };
};

type RoomTileEndResult = {
  // `true` only when `outcome === "playAgain"` (kept for back-compat).
  playAgain: boolean;
  // How the end UI settled:
  //  - "playAgain"  — user tapped Play Again
  //  - "review"     — user tapped your `actions.review` button (see below)
  //  - "closed"     — user dismissed otherwise (picked another tile, navigated away)
  //  - "dismissed"  — superseded programmatically via Poe.room.dismissTileEnd()
  outcome: "playAgain" | "review" | "closed" | "dismissed";
};
```

`bestScore`, `label`, `unit`, and optional per-entry `displayScore` come from the
persisted leaderboard row. Labels are limited to 40 characters; each unit form
is limited to 20 characters. When provided, the label and both unit
forms must contain a non-whitespace character; blank or whitespace-only values
are rejected at the tile-end API boundary.

`actions.playAgain: false` hides the Play again button for tiles with no
meaningful replay (a daily puzzle, a one-shot). `actions.review` adds a
tile-owned review button (label required, ≤ 40 chars — e.g. "Watch replay",
"View board"). When the user taps it the overlay closes and the promise
resolves with `outcome: "review"`; show your own review surface (the final
board, a step-through replay) with an in-tile way back, and call
`Poe.room.tileEnd()` again with the same leaderboard id when the user is done so
they return to the end screen:

```typescript
const result = await Poe.room.tileEnd({
	leaderboardId: "replay-scores",
  actions: { review: { label: "Watch replay" } },
});
if (result.outcome === "playAgain") startNewRound();
else if (result.outcome === "review") openReplay(); // re-call tileEnd() on close
```

The optional `round` is an app-owned id for this terminal round (e.g. the run's
start timestamp or a round id from your synced store). Pass it so a later
`Poe.room.dismissTileEnd({ supersedesRound })` can target exactly this overlay.
Keep it short — `round` (and `supersedesRound`) are rejected at ingestion if they
exceed 256 characters, so don't pass a serialized game state as the id.

When the user chooses another tile from the end UI, the host creates the rematch on the device after local synced-store hydration has supplied the exact roster and room refs: it reads cached/external `$$system.room`, `$users`, and `$userInfo`, mints a fresh room and instance, seeds the new room with the human players from the round, then opens the selected tile, unmounts the current tile, and resolves `{ playAgain: false }`. No server round-trip is needed for the end overlay or rematch creation itself, so the seeded room is durable across reloads and reconnects when the device is offline after creation. Agent players are not carried into the rematch room — a new round adds its own agents. If the current tile is already in a child room, the new room is a sibling; otherwise the current room becomes the parent. Choosing Play Again resolves `{ playAgain: true }` without navigating.
For score payloads, the host displays scored active humans' names and profile pictures ranked by the leaderboard settings, followed by unscored active humans as blank rows in room join order. `{ everyone: score }` is shown as a team score for all active players.

### `Poe.room.setShareLeaderboardId(leaderboardId)`

Tell the host which tile-owned leaderboard should be used when the user copies or shares the current page's invite link. The host derives the calling tile instance from trusted RPC context, so tiles pass only the leaderboard id. The manager applies the setting only while that tile instance is the visible current page; route changes clear it.

Use this for pages that show a persistent leaderboard but do not open the tile-end overlay:

```typescript
await store.mutate.submitScore({ score });
await Poe.room.setShareLeaderboardId("daily");
```

```typescript
Poe.room.setShareLeaderboardId(leaderboardId: string): Promise<void>;
```

`leaderboardId` is app-owned, bounded, and should match the id you use with `setLeaderboard(ctx, ...)`, `setLeaderboardScore(ctx, ...)`, or `getLeaderboard(ctx, ...)`. Use `"default"` for the default board.

### `Poe.room.dismissTileEnd(opts?)`

Programmatically dismiss **this client's** active tile-end overlay (instead of waiting for the user to tap). The calling tile instance is derived from trusted RPC context; you can only dismiss your own instance's overlay. The pending `Poe.room.tileEnd()` promise on this client resolves with `outcome: "dismissed"`.

This is the building block for a **shared-instance team game** where everyone plays one persistent instance: when one player advances the shared round, every other client clears its now-stale overlay on its own. It is per-client — the "everyone's screen clears" effect comes from each client calling this in reaction to shared synced-store state, not from a broadcast.

```typescript
type RoomDismissTileEndInput = {
  // Dismiss ONLY if the active overlay's `round` equals this (so a delayed
  // call can't close a newer overlay). Omit to dismiss the active overlay
  // unconditionally (simple single-round apps).
  supersedesRound?: string;
};

Poe.room.dismissTileEnd(opts?: RoomDismissTileEndInput): Promise<void>;
```

Resolves once the host handles the dismiss (no-op if no matching overlay is showing); rejects if no host supports dismissal or if called from the root app.

Typical shared-game pattern — tag the round on `tileEnd`, then dismiss when your synced state shows a new round is live:

```typescript
// Install the dismiss watcher BEFORE awaiting tileEnd: the await blocks until
// this client's overlay settles, so a watcher registered AFTER it resolves is
// too late — there is no overlay left to dismiss. When the shared round advances
// (a peer started the next round), dismiss our now-stale overlay; tear the
// watcher down in `finally` once tileEnd has settled.
const unsubscribe = store.subscribe(
  (tx) => tx.table("game").get("game"),
  (game) => {
    if (game?.round === finishedRoundId) return;
    void Poe.room.dismissTileEnd({ supersedesRound: finishedRoundId });
  },
);
try {
  // Every client reports the team result tagged with the finished round id.
  const result = await Poe.room.tileEnd({ leaderboardId: "team", round: finishedRoundId });
  if (result.outcome === "playAgain") restartIfStillCurrent(finishedRoundId); // generation-guarded
  // outcome "dismissed" / "closed" → another client drove it, or the user left; do nothing.
} finally {
  unsubscribe();
}
```

Make the restart **generation-guarded / idempotent** (restart only if the just-finished round is still current) — when several players tap Play Again at once, the platform does not serialize the restarts.

### `Poe.agents.create({ agentId, name, model, tools?, room? })`

Create a new agent owned by the calling user. You mint the agent's `agentId` (an `agent_<uuid>`) and pass it as the **idempotency key**; the trusted host runs the whole creation server-side in one round-trip: it claims the per-creator-unique `name` in the caller's agents registry, initializes the agent's store with the given `model` and `tools`, and — when you pass a `room` — adds the new agent to that room in the same call.

```typescript
// Use the portable `generateUUID()` helper, not `crypto.randomUUID()` — the
// latter is unavailable on non-secure LAN / dev origins (common for local and
// mobile testing).
const agentId = `agent_${generateUUID()}`;
const result = await Poe.agents.create({
  agentId, // client-minted idempotency key — reuse it across retries
  name: "Code Reviewer",
  model: "claude-sonnet-4-6",
  tools: ["read_file"], // restricts the agent to these system tools (order ignored)
  room: { typeId: "chat", instanceId: roomId }, // optional: create + add in one call
});
```

`agentId`, `name`, and `model` are required (`name`/`model` are trimmed by the host); `name` is unique among the calling user's agents (case-insensitive). `tools` is the system-tool allow-list — an **explicit grant list** (deny-by-default): the agent may use exactly the tools named, and omitting it (or passing `[]`) gives the agent **no system tools** (the default for auto-created agents; grant tools later via a config edit). Tool order doesn't matter — it's treated as a set. `room` is optional; when supplied you must be a live member of that room (direct-message rooms are refused), and the room is validated before the agent is created so a bad room never leaves an orphaned agent.

**The `agentId` is the idempotency key.** Mint it once per logical create intent and **reuse it across retries** (don't generate a fresh id on retry, or you lose idempotency). Calling `create` again with the same `agentId` returns your existing agent and **ignores the rest of the payload** — `reused` is `true` when the existing agent was returned and `false` when a fresh one was minted; the optional `room` add still applies on reuse. So a retry (or a double-submit) safely resolves to the same agent. Config changes go through the edit flow, never `create`. The promise rejects only on a *real* conflict — a **new** `agentId` whose `name` is already taken by a different agent — or when the room is invalid or initialization fails.

The returned `agentId` echoes the id you minted (an `agent_…` id usable as a room member id), and `addedToRoom` reports whether the optional `room` add succeeded. Agents join rooms through the membership APIs (below); apps never mount or read the agent's own store.

### `Poe.agents.addToRoom({ agentId, typeId, instanceId })` / `Poe.agents.removeFromRoom({ agentId, typeId, instanceId })`

Add or remove an existing agent as a member of a room. Use `addToRoom` to bring one of your agents into a room you're a live member of; use `removeFromRoom` to take it out. Both resolve once the membership change is committed.

```typescript
await Poe.agents.addToRoom({ agentId, typeId: "chat", instanceId: roomId });
await Poe.agents.removeFromRoom({ agentId, typeId: "chat", instanceId: roomId });
```

`addToRoom` requires that you are the agent's creator **and** a live member of the room; `removeFromRoom` is creator-only.

### `Poe.agents.listTools()`

List the first-party agent system-tool catalog — the `{ id, displayName, description }` metadata for every built-in system tool an agent can be granted. Use it to render tool ids and display names in your own agent-building UI without hardcoding the list.

```typescript
const tools = await Poe.agents.listTools();
// e.g. [{ id: "calculator", displayName: "Calculator", description: "Evaluates arithmetic expressions." }]

// The ids are exactly what `Poe.agents.create({ tools })` accepts:
await Poe.agents.create({
  name: "Mathbot",
  model: "claude-sonnet-4-6",
  tools: tools.map((tool) => tool.id),
});
```

Read-only public metadata — it takes no arguments, requires no permissions, and returns the same catalog for everyone.

### `Poe.agents.listTemplates()`

List the first-party agent-template catalog — the preset agent configurations (name, model, and tool grant) that pre-fill the agent-create form. Use it to render a template picker in your own agent-building UI without hardcoding the presets.

```typescript
const templates = await Poe.agents.listTemplates();
// e.g. [{
//   id: "math-helper",
//   displayName: "Math Helper",
//   description: "Works through arithmetic step by step using a calculator tool.",
//   iconEmoji: "🧮",
//   config: { suggestedName: "Math Helper", model: "claude-sonnet-4-6", tools: ["calculator"] },
// }]

// A template's `config` is exactly what `Poe.agents.create` accepts — instantiation is a copy:
const template = templates.find((t) => t.id === "math-helper");
if (template) {
  await Poe.agents.create({
    name: template.config.suggestedName,
    model: template.config.model,
    // `config.tools` is `readonly string[]`; spread into a mutable copy for the create input.
    tools: [...template.config.tools],
  });
}
```

Read-only public metadata — it takes no arguments, requires no permissions, and returns the same catalog for everyone. Picking a template only pre-fills the create form; there is no live template↔agent link after creation.

### `Poe.agents.listMine()`

List **your own** live agents — the `{ agentId, name, model }` metadata for every agent you have created. Use it to render a picker of the caller's agents, or to resolve one of your agents by name to its `agentId` so you can add it to a room with `Poe.agents.addToRoom`.

```typescript
const mine = await Poe.agents.listMine();
// e.g. [{ agentId: "agent_ab12…", name: "Math Helper", model: "claude-sonnet-4-6" }]

// Resolve a name to an agentId (case-insensitive), then add it to a room:
const match = mine.find((a) => a.name.trim().toLowerCase() === "math helper");
if (match) {
  await Poe.agents.addToRoom({ agentId: match.agentId, typeId: "chat", instanceId: roomId });
}
```

Caller-scoped: it lists **only your own** agents (listing your own is not a permission escalation), so there is no way to enumerate or add another user's agents by a guessed name — always add by the opaque `agentId`.

### `Poe.track(event, properties?)`

Send a fire-and-forget analytics event through the host-owned analytics pipeline.

```javascript
Poe.track("tile_opened", { tileType: "chat" });
Poe.track("space_invite_sent", { channel: "share-link" });
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `event` | string | Yes | Event name matching `/^[a-z0-9_$-]+$/i`, up to 128 characters |
| `properties` | object | No | JSON-serializable property bag, up to 100 top-level keys and 32 KB serialized |

`Poe.track()` returns immediately and does not report whether an event was forwarded. The SDK, host kernel, and first-party relay all validate the envelope; invalid events, reserved keys, PII-looking keys, oversized payloads, anonymous users, or disabled analytics are silently dropped.

### `Poe.openExternalUrl({ url })`

Ask the host to open a web link. This is the only way an app can open a link outside itself — the iframe sandbox has no `allow-popups`, so `window.open` and `target="_blank"` are blocked before the host can see them.

```javascript
await Poe.openExternalUrl({ url: "https://example.com/rules" });
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | An http(s) URL, up to 8192 characters |

The host decides how the link opens. A link back into the platform itself (same origin as the host and matching a real platform page — for example an invite link shared in chat) navigates in place, like any other in-app navigation, with no confirmation. Any other link shows the user a confirmation with the destination host before anything opens; the user can decline. When the user confirms, the link opens in a new tab on the web, or in the platform in-app browser inside the mobile apps. The returned promise resolves when the request is accepted (not when the user confirms or navigation happens) and rejects for invalid URLs (non-http(s) schemes, over-length).

### `Poe.openSettings({ section? })`

Ask the host to navigate to its Settings page. Fire-and-forget; the promise resolves once the request is accepted.

```javascript
await Poe.openSettings({ section: "poe-account" });
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `section` | `"poe-account"` | No | Hint for which settings sub-section to focus. The host may ignore it. |

Pair this with [`Poe.getPoeBotAccess()`](#poe-getpoebotaccess): when the user can't use bots, send them to `{ section: "poe-account" }` to connect / reconnect / enable Poe points.

### `<poe-tile>` Custom Element

```html
<poe-tile type-id="my-game" instance-id="lobby-123"></poe-tile>
```

A custom HTML element that renders a child app inline. This is how one app embeds and renders another app inside itself.

The child app runs in a sandboxed iframe within the element's shadow DOM. The embedded app calls `Poe.setupStore()` normally — it doesn't know it's embedded.

To use `<poe-tile>`, register it in your entry file:

```javascript
import { registerPoeTileElement } from "poe-tiles-sdk/v1/client.js";
registerPoeTileElement(environment);
```

#### Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `type-id` | string | Yes | The app type ID to embed (max 128 characters) |
| `instance-id` | string | Yes | Full instance ID for the child app's store. Callers construct this themselves, typically as `${parentInstanceId}-${childHandle}`. The same instance ID reconnects to the same store data. (max 256 characters) |
| `open-props` | string (JSON) | No | JSON-serializable data to pass to the child app at open time (max 10 MB). The child reads it via `Poe.getOpenProps()`. |
| `room` | `"self" \| "inherit" \| "explicit"` | No | Flat-room mode. `"inherit"` (default when omitted) — child joins the DOM-parent's room. `"self"` — child owns its own `$users` roster (standalone). `"explicit"` — child joins the room identified by paired `room-type-id` + `room-instance-id` attrs. |
| `room-type-id` | string | When `room="explicit"` | Store type ID of the explicit room (max 5,000 characters). |
| `room-instance-id` | string | When `room="explicit"` | Store instance ID of the explicit room (max 5,000 characters). |
| `opener-store-type-id` | string | No | *Logical* parent identity (type ID half) when this `<poe-tile>` is mounted by the root app on behalf of a `Poe.open` call. Lets `room="inherit"` resolve against the opener's `$$system:room` instead of the DOM-parent's (manager). Honored only by the root app — untrusted iframes stamping this on their own embedded `<poe-tile>` have no effect. (max 5,000 characters) |
| `opener-store-instance-id` | string | No | Pairs with `opener-store-type-id`. (max 5,000 characters) |
| `focus-on-mount` | boolean attribute | No | Focus the child iframe as soon as it mounts (including remounts and reloads), so keyboard-driven content receives key events without the user first clicking inside it. Set it only on the primary tile in view. It never steals focus from a focused text entry or from another `<poe-tile>`; a host-hidden tile defers the focus until it is revealed. |

To mount a `<poe-tile>` with an `instance-id` that has **never existed before**, first call [`Poe.tiles.prepareNewInstances`](#poe-tiles-preparenewinstances-instances) to declare its genesis, then render the element. There is no `is-new` attribute: the kernel reads the prepared spec from durable client metadata when the store mounts, treats it as a fresh creator (skips the IndexedDB probe and the server-`clientOrdinal` wait), and pins it via `$bootstrapStore`.

#### Host Visibility

If a parent keeps a child `<poe-tile>` mounted while covering it with parent chrome, set the element's JS `hostVisible` property. This is separate from browser page visibility: the child iframe's `document.visibilityState` can still be `"visible"` while the host has hidden it behind a switcher, drawer, or modal.

```javascript
import { setChildPoeTileHostVisible } from "poe-tiles-sdk/v1/client.js";

setChildPoeTileHostVisible(childPoeTileElement, false); // covered by host UI
setChildPoeTileHostVisible(childPoeTileElement, true);  // visible again
```

Child apps that need "user has actually seen this" behavior can check and subscribe to host visibility:

```javascript
import {
  isPoeTileHostVisible,
  subscribePoeTileHostVisibility,
} from "poe-tiles-sdk/v1/client.js";

if (document.visibilityState === "visible" && isPoeTileHostVisible()) {
  // Safe to count visible content as seen.
}

const unsubscribe = subscribePoeTileHostVisibility((visible) => {
  console.log("Host visibility changed:", visible);
});
```

Apps with foreground-only work, such as animation loops, physics, polling, audio, or WebGL rendering, should use the foreground helper. It combines host visibility with `document.visibilityState`, so the app pauses when either the browser tab is hidden or the host covers the iframe with platform chrome:

```javascript
import {
  isPoeTileForeground,
  subscribePoeTileForegroundState,
} from "poe-tiles-sdk/v1/client.js";

let foreground = isPoeTileForeground();
let raf = 0;

const unsubscribe = subscribePoeTileForegroundState((next) => {
  foreground = next;
  if (foreground) scheduleRenderLoop();
});

function scheduleRenderLoop() {
  if (raf !== 0 || !foreground) return;
  raf = requestAnimationFrame(renderLoop);
}

function renderLoop() {
  raf = 0;
  if (!foreground) return;
  // Do foreground-only work.
  scheduleRenderLoop();
}

scheduleRenderLoop();
```

#### Usage

```html
<!-- Vanilla HTML -->
<poe-tile type-id="chat" instance-id="parent-123-my-chat-1"></poe-tile>

<!-- With open props (HTML attribute) -->
<poe-tile type-id="chat" instance-id="parent-123-my-chat-1" open-props='{"theme":"dark"}'></poe-tile>
```

```jsx
// React — construct instance-id from parent's instanceId + child handle
<poe-tile
  type-id={selectedApp.typeId}
  instance-id={`${instanceId}-${selectedApp.id}`}
  style={{ display: "block", flex: "1", minHeight: "0" }}
/>
```

```javascript
// Programmatic — set openProps via JS property (overrides attribute)
const el = document.createElement("poe-tile");
el.setAttribute("type-id", "chat");
el.setAttribute("instance-id", "parent-123-my-chat-1");
el.openProps = { theme: "dark", userId: "abc" };
document.body.appendChild(el);
```

#### TypeScript JSX Support

To use `<poe-tile>` in TypeScript React projects, add a type declaration:

```typescript
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "poe-tile": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          "type-id": string;
          "instance-id": string;
          "open-props"?: string;
        },
        HTMLElement
      >;
    }
  }
}
```

#### How It Works

1. On mount, the element calls `apps.openChild` via `postMessage` to the top-level document (with optional `openProps`)
2. The host registers the instance, injects session config and openProps into the HTML template
3. A blob URL is created from the HTML and loaded in a sandboxed iframe (`allow-scripts allow-forms`)
4. The child app communicates with the platform via `window.top.postMessage` using a nonce for routing
5. On unmount, the iframe is removed and the blob URL is revoked

### `Poe.getOpenProps()`

Read JSON data passed by the parent app when this app was opened via `<poe-tile>`. Returns `null` if no props were passed or if this is a top-level app.

```javascript
const props = Poe.getOpenProps();
if (props) {
  console.log(props.theme); // "dark"
}
```

Open props are **read-once at startup** — they are baked into the HTML when the iframe is created and are not reactive. For reactive parent-child communication, use Synced Store.

### `Poe.consumeEntryContext()`

Read the **entry context** for this mount — how the user got here, and the small creator-defined payload attached to the notification they tapped. Like `getOpenProps()`, it is available synchronously before your tile code runs.

```typescript
type EntryContext =
  | { source: "direct" }
  | {
      source: "push" | "banner" | "badge";
      notification: {
        context: JSONValue;   // what a sender attached via notifyActivity's push.context
        senderId?: string;    // the responsible user (absent for system notifications)
        sentAtMs: number;     // when the notification was enqueued
      };
    };

const entry = Poe.consumeEntryContext();
if (entry.source !== "direct") {
  // context is creator-defined JSON — narrow it defensively before use
  const context = entry.notification.context;
  if (
    context !== null &&
    typeof context === "object" &&
    !Array.isArray(context) &&
    context.kind === "challenge"
  ) {
    // …opened from a challenge push — decide whether to show the overlay
  }
}
```

- **`source`** — `"push"` (tapped an OS notification), `"banner"` (tapped the in-app foreground notification banner), `"badge"` (tapped a badged in-app row / app-icon badge), or `"direct"` (a normal open, with no notification provenance). `push` and `banner` resolve the *exact* notification tapped; `badge` resolves the newest unconsumed notification for the tile. Branch on `source !== "direct"` when you only care that the user arrived from a notification.
- **`notification.context`** — the exact JSON a sender passed to [`notifyActivity`'s `push.context`](#notifyactivity). This is a **stale-able hint, not authoritative state**: by the time the recipient opens the tile the challenge may already be beaten, the turn already played, the message already read. **Always re-derive display state from your store** and use the context only to decide *what to surface*.
- **Consumed at most once per notification-originated mount.** The first call returns the notification and fires a host acknowledgement; later calls in the same mount — and every normal open — return `{ source: "direct" }`. Read it once at startup and thread the result into your tile.
- **Route-mounted tile only.** A DOM-nested [`tiles.openChild`](#poe-tile-custom-element) child always reads `{ source: "direct" }`; if a child needs the context, the parent forwards what it needs via `openProps`.
- **Per-device, at-least-once.** Consumption is tracked per device (so opening on your phone doesn't consume it on your tablet), and a crash between read and acknowledgement re-delivers on the next mount — a rare duplicate overlay is acceptable, so keep the reaction idempotent.

**When to attach context, and when to show nothing.** Attach `push.context` when tapping the notification should land the user somewhere more specific than the tile's default screen — a challenge overlay, a game-over recap, first-turn framing, or a scroll to the referenced entity. Keep the payload tiny (an id plus a `kind` discriminator) and validate against your store on arrival: show the overlay only if the challenge still stands, scroll only if the message is in loaded history, otherwise fall through to a normal open. Do **not** attach context (or show any special UI) for routine, low-signal events — an ordinary turn on move 23, a daily nudge — where a plain open is exactly right; a mistimed overlay is worse than none.


### `Poe.parent`

The parent store's identity, available for child apps opened via `<poe-tile>` or `Poe.open()`. Returns `null` for root apps (apps not opened as children of another app).

```typescript
type ParentStoreInfo = {
  storeTypeId: string;
  instanceId: string;
};

Poe.parent; // { storeTypeId: "my-parent-app", instanceId: "room-42" } or null
```

Use this to pass the parent's store identity as input to mutators that dispatch [external mutations](../../synced-store/references/external-stores.md) to the parent store:

```javascript
// In the child app's UI code (client-only):
await store.mutate.notifyParent({
  parentTypeId: Poe.parent.storeTypeId,
  parentInstanceId: Poe.parent.instanceId,
  message: "task completed",
});

// In the mutator (runs on both client and server):
notifyParent: async (ctx, input) => {
  ctx.mutateExternal({
    storeTypeId: input.parentTypeId,
    instanceId: input.parentInstanceId,
    mutationName: "receiveChildNotification",
    input: input.message,
  });
},
```

This pattern works because the parent identity flows as regular mutation input — the server doesn't need to know about parent/child app relationships.

### `Poe.topOrigin`

Origin of the top (host) document — e.g. `"https://poe.com"` in production, `"http://localhost:5105"` in dev. Apps read it to build absolute URLs that resolve against the host instead of the sandboxed iframe.

```typescript
Poe.topOrigin; // "https://poe.com" or undefined
```

Poe tiles run inside a sandboxed blob-URL iframe. Inside that iframe, `window.location.origin` is the string `"null"` (sandboxed) or an app-hosting subdomain — neither routes to the host's UI. The platform therefore injects the top document's origin into the iframe via `<div id="poe-config" data-top-origin="...">`, which `PostMessageEnvironment` reads and exposes here.

Returns `undefined` on older hosts that don't inject the attribute; apps should fall back to path-only URLs in that case so they degrade gracefully.

```typescript
// Build a shareable invite URL.
const path = `/invites/${encodeURIComponent(code)}`;
const shareUrl = Poe.topOrigin ? `${Poe.topOrigin}${path}` : path;
await navigator.clipboard.writeText(shareUrl);
```

For top-document apps (trusted apps not running in an iframe) that construct a `PostMessageEnvironment` manually, pass `topOrigin: window.location.origin` in the constructor options.

### `Poe.capabilities`

Resolved host surface capabilities — a flag map describing which surfaces the host enables. Always a full object: any flag the host did not restrict (or the whole config when the host imposes no restrictions) reads as enabled, so `Poe.capabilities.<flag>` is safe to read without a null check.

```typescript
Poe.capabilities; // { bots: true, ownChats: true, ... }
```

Most apps do not need this — it exists for first-party host surfaces that hide their own affordances when the host runs in a restricted mode (for example a host that disables bot/AI affordances). The host bakes the set into the iframe via `<div id="poe-config" data-capabilities="...">`, which `PostMessageEnvironment` reads and `createPoe` resolves against the all-enabled default. It is UI defense-in-depth only — the server is always the authority on what an app may actually do.

### `Poe.haptics`

Trigger cross-platform hardware haptic feedback. Fire-and-forget — calls return immediately and the device buzzes on platforms that have hardware support. Modeled on Apple's `UIFeedbackGenerator` taxonomy because it's the richest target the platform mapping has to satisfy.

```typescript
// Discrete tactile feedback for a user action.
Poe.haptics.impact("light" | "soft" | "medium" | "rigid" | "heavy");

// Outcome feedback for a completed operation.
Poe.haptics.notification("success" | "warning" | "error");

// A small tap each time the selected value changes (slider tick, picker wheel).
Poe.haptics.selection();
```

Safe to call from any context — no `isPoeNativeBridgeAvailable()` gate needed. Platforms with no haptic-capable path silently no-op.

#### Platform support

| Platform | What plays |
| --- | --- |
| iOS app | `UIImpactFeedbackGenerator` / `UINotificationFeedbackGenerator` / `UISelectionFeedbackGenerator` via a JS-bridge call. Best fidelity. |
| Android app and mobile web (same code path) | `navigator.vibrate` with a fixed duration per style. The Android app's WebView is Chromium and supports the Vibration API directly, so the feel is identical between in-app and mobile web on the same device. |
| iOS Safari 17.4+ (mobile web) | A single subtle tap, via the `<input switch>` label-click trick. **All styles collapse to the same tick on this path** — see "Limitations" below. |
| Desktop browsers, older iOS Safari | Silent no-op. |

#### Usage

```typescript
// In a button handler:
function onTapAttack() {
  Poe.haptics.impact("medium");
  // …apply game-state change
}

// On a successful save:
async function onSave() {
  await persist();
  Poe.haptics.notification("success");
}

// While dragging a value slider:
function onSliderTick() {
  Poe.haptics.selection();
}
```

Haptics calls are fire-and-forget by design — there's no `await` and no return value to check. Don't gate UI on a successful haptic; let it be a finishing touch on top of whatever the user did.

#### Limitations

- **No custom patterns.** The API is intentionally semantic-only. iOS doesn't expose arbitrary haptic patterns to web code, so a raw-pattern API would silently degrade on half your users. The semantic taxonomy maps cleanly to every platform that has any haptic support.
- **iOS Safari is one-intensity.** On iOS mobile web, every style fires the same subtle tap — `impact("heavy")` and `selection()` feel identical.
- **iOS Safari < 17.4 is silent.** No fallback exists short of audio cues you'd implement yourself. Same answer applies to desktop browsers.
- **User can disable haptics.** All platforms respect the user's system-level haptics setting — the call still resolves, but the device stays still. Don't treat haptic feedback as a reliable signal that the user noticed the action.

## Synced Store Helpers

Convenience helpers for common store operations — notifying the sidebar of activity. These wrap `ctx.mutateExternal()` so you don't need to know the manager's store type ID or mutation names.

Import from the client SDK:

```typescript
import {
  notifyActivity,
  setTurn,
  clearTurn,
  addInstanceToRoom,
} from "poe-tiles-sdk/v1/client.js";
import {
  assertRoomMember,
  notifyUsersAddedToTile,
} from "poe-tiles-sdk/v1/shared.js";
```

### `notifyActivity()`

Notify the manager of activity in this app instance. Four independent dials — `preview` (sidebar text + bumps the space in recents), `unread: "increment"` (app-owned unread count → numeric badge in the sidebar and contribution to the RECENTS-header total), `push` (OS-level push notification), and `postToChat` (append one announcement row to the containing chat room). Standard unread behavior is enabled by default in `defineSchema()` and `defineClientConfig()`. Apps with custom read semantics should declare `customUnread()` in both places; apps that intentionally never use unread should declare `noUnread()`. Pick the right combination for the kind of activity, and target it precisely with `targetUserIds`. See [When to notify, and at what level](#when-to-notify-and-at-what-level) below.

```typescript
await notifyActivity(ctx, {
  preview: input.text.slice(0, 200),
  previewTimestamp: Date.now(),
  unread: "increment",
  // No `title`: the manager composes the recipient's room title at delivery
  // ("<tile>: <room/opponent>"). Pass one only to override it.
  push: {
    body: input.text.slice(0, 200),
  },
});
```

**Parameters:**

| Field | Type | Description |
|-------|------|-------------|
| `preview` | `string` | Preview text for the sidebar (e.g., last message). Self-contained — no sender prefix is added. |
| `previewTimestamp` | `number` | Timestamp of the activity. Bumps the space in the recents list. |
| `unread` | `"increment"` (optional) | Increments each non-caller recipient's app-owned unread count by 1, lights up the per-space numeric badge, and contributes to the RECENTS-header total. Works with the default simple unread policy, or with an explicit `simpleUnread({ clearOn: "active" })`; omit it for preview / sort-order updates that should not grow the badge. |
| `unreadToCaller` | `boolean` (optional, default `false`) | Opts the caller into `unread: "increment"` for a system-attributed receipt delivered back to that user (for example, an agent finishing work the user started). Requires `unread: "increment"` and requires the caller to be in the activity recipient set. |
| `targetUserIds` | `string[]` (optional) | Specific users to notify. Omit to notify all active members. On the client, also controls whether the optimistic pass runs — see Behavior. |
| `push` | `{ title?, body, pushToCaller? }` (optional) | When present, enqueues a push notification. Defaults to "every activity recipient *except* the caller" — see Push Notifications below. |
| `push.title` | `string` (optional) | Notification title. Omit it to have the manager compose `"<tile>: <room/opponent>"` at delivery (matching the recipient's recents-row title), the same as a `setTurn` push. Pass an explicit string only to override that. |
| `push.body` | `string` | Notification body (typically preview / message text). |
| `push.pushToCaller` | `boolean` (optional, default `false`) | Opt the caller into the push subset. Use only when the activity is not user-attributable to the caller (e.g. a system event the caller happened to trigger, like a horse-race result). Throws if `true` and the caller is not in the activity recipient set. |
| `push.context` | `JSONValue` (optional) | A small creator-defined **entry context** the recipient's tile reads at launch (via [`Poe.consumeEntryContext()`](#poe-consumeentrycontext)) when they open the tile by tapping this notification. Size-capped at 4 KB serialized and validated at ingestion. A stale-able **hint**, not authoritative data — see [Entry context](#poe-consumeentrycontext). Must not contain secrets: only an opaque id transits the push vendor, but the payload is delivered to the recipient's devices and retained until TTL/cap cleanup. |
| `postToChat` | `{ messageId, text, timestamp }` (optional) | Also appends one app-owned announcement message to the chat room that contains this app. The destination is resolved server-side from the source store's pinned `$$system/room`; callers cannot provide a chat id. If there is no containing chat room, `notifyActivity()` logs a warning and skips only the chat append. Chat validates `messageId` for API compatibility, but ignores it for row identity, uses its next `msg/...` sortKey, and derives a separate chat-owned itemKey from that sortKey. |

**Behavior:**

- **Client**: dispatches to the current user's manager only if `ctx.userId` is in `targetUserIds` (or `targetUserIds` is omitted); otherwise the client-side pass is a no-op and only the server's authoritative fan-out lands. This prevents a wrong-sidebar-state flash when `targetUserIds` excludes the caller (e.g. a "Your turn" notification sent to a single non-caller).
- **Server**: dispatches to each user in `targetUserIds`, or all active members if omitted. Users not in the app's `$users` table are filtered out.
- **Chat posting**: when `postToChat` is present, the server declares a sibling mutation to the containing chat room after the manager/unread declarations. If the app is not running inside a chat room, the helper logs a warning and skips that sibling mutation. The chat receiver writes the announcement row only; it does not call back into the manager, so one `notifyActivity()` call stays one manager activity.

### `setTurn()` / `clearTurn()`

Declare whose turn it is in the calling app instance — the data behind the manager's **"Your Turn"** indicator (a pill on the room/tile). Call these from inside your mutator, the same place you call `notifyActivity`. A new turn mark also moves the recipient's visible room to the top of Recents without overwriting its existing preview. Each marked user's turn state is per-user-private — only that user ever sees their own "Your Turn."

`setTurn(ctx, input)` marks users up:

| Field | Type | Description |
|-------|------|-------------|
| `userIds` | `string[]` | Users to mark as "it's your turn" in this app instance. |
| `replace` | `boolean` (optional, default `true`) | `true` → declarative replace: members currently up but **not** in `userIds` are cleared, so passing the turn to the next player clears the previous holder automatically. `false` → additive: only `userIds` are touched (e.g. a simultaneous game where players become ready one at a time). |
| `push` | `boolean \| { title?, body }` (optional, default `true`) | `true` → default OS push to newly-added users (body "It's your turn.", title filled by the manager from the game/room name). `false` → mark silently. Object → override title/body. |

Marking is **idempotent** — re-marking an already-up user does nothing (no duplicate push, unread increment, or recents bump). A new turn mark increments the target's unread and bumps the target's visible room to the top of Recents, so the actionable tile stays discoverable. Capped at `MAX_TURN_USER_IDS` users per call.

`clearTurn(ctx, input)` is explicit down-marking — the readable counterpart to `setTurn`'s implicit replace-clear:

- `{ userIds }` — clear just those users.
- `{ all: true }` — clear every current turn-holder in this instance (e.g. game over).

`clearTurn` never touches unread (unread clears on view).

**Behavior:** the server pass fans out to each target user's manager; the client pass optimistically updates only the caller (so the mover's own pill clears the instant they take their turn). The authoritative fan-out lands on the server.

```typescript
// Sequential game (chess, checkers): pass the turn to the next player. This
// automatically bumps their room to the top of Recents, increments unread,
// marks "Your Turn," and sends the context-rich push.
const preview = `${moverName} played ${moveLabel}`;
await setTurn(ctx, {
  userIds: [nextPlayerId],
  push: { body: `${preview} — your move` },
});

// Simultaneous game: several users up at once (still a replace).
await setTurn(ctx, { userIds: [aliceId, bobId] });

// Add a player to the active set without disturbing the others.
await setTurn(ctx, { userIds: [carolId], replace: false });

// Mark up silently (no OS push), e.g. a low-stakes nudge.
await setTurn(ctx, { userIds: [nextPlayerId], push: false });

// Context-rich body — say what just happened instead of the generic default.
// Build it from the move/turn that triggered the change.
await setTurn(ctx, {
  userIds: [nextPlayerId],
  push: { body: `${moverName} took your ${pieceName} — your move` },
});

// Tile end — clear everyone, explicitly.
await clearTurn(ctx, { all: true });

// Clear one specific player (e.g. they resigned).
await clearTurn(ctx, { userIds: [aliceId] });
```

**Make the push body context-rich and engaging.** The default `"It's your turn."` works, but a body that names *what just happened* — `"Jacob just took your bishop"`, `"It's your turn to guess the word"`, `"Aaron checked you — your move"` — is far more likely to pull a player back into the game. Build it from whatever triggered the turn change (the captured piece, the played card, the round/phase, the score to beat) and fall back to the generic default only when there's genuinely no context to add (e.g. an undo, the opening move). You usually only set `body`; the manager fills `title` from the game/room name.

**Do not add `notifyActivity` only to make a turn discoverable.** `setTurn` already bumps each newly marked recipient's room to the top of Recents. Call `notifyActivity` separately when the sidebar preview should describe the move, or when the actor, spectators, or other non-turn-holders should also receive an activity update. Omit `unread` for the next player in that companion call because `setTurn` already increments it.

### `assertRoomMember()`

Validate inside a mutator that a user is still an active member of the caller's resolved room.

```typescript
await assertRoomMember(ctx, { userId: input.userId });
```

The client optimistic pass is a no-op. The server pass reads the trusted `$$system.room` row: self-room stores validate against their own `$users`, and room-member stores validate against the canonical room store's `$users`. For child rooms with `$$system.room.parent`, a user who is not yet in the child but is active in the parent also passes; a child `$users` row, including a removal tombstone, wins over parent membership. This matters when a user is in the room but has never opened the tile, so they do not appear in the tile instance's local `$users` mirror yet.

### `notifyUsersAddedToTile()`

Send standard "added/assigned to this tile" activity and push notification to selected room members.

```typescript
await notifyUsersAddedToTile(ctx, {
  targetUserIds: [input.userId],
  appName: "Checkers",
  reason: "assigned",
  previewTimestamp: input.now,
});
```

The helper is server-only and validates every target against the caller's canonical room before dispatching. It uses the same manager `receiveActivity` path as `notifyActivity`, but does not filter against the tile instance's local `$users`, so it can notify room members who have not opened the tile. Use `notifyActivity()` directly for custom copy, unread behavior, or chat announcements.

**Unread policy is app-owned.** By default, the SDK stores a per-user private unread projection and clears it when the host reports that the user is active in the app. Apps with custom read semantics can declare `customUnread()` and call `setUnreadCount(ctx, { count })` from their own mutators. Apps that never use unread can declare `noUnread()`.

**Push Notifications:**

When `push` is present, each recipient's manager enqueues a pending delivery row alongside the sidebar update.

- **Default sender-suppression.** The helper strips `push` from the caller's own dispatch. The caller's other devices still get the activity update via sync but no OS-level push for their own action. Override only when the activity isn't user-attributable to the caller — set `push.pushToCaller: true`.
- **OS-level "currently in the app" suppression.** Don't ring the device a recipient is actively using is handled at the OS layer (`UNUserNotificationCenterDelegate` on iOS, equivalents on Android/web), not by the helper.
- **Tap target is implicit.** Delivery channels construct deep-links from the calling app's `typeId` + `instanceId` — apps don't specify a URL.

**Limits:** Each notified user's manager is one external mutation target. The limit is `MAX_EXTERNAL_MUTATION_TARGETS` (200) unique target stores per commit.

#### When to notify, and at what level

| Activity kind | `unread` | `push` | Example |
|---|---|---|---|
| Action required from a specific user | `"increment"` | yes | "Jacob just took your bishop" — sent to the player whose turn it is (name the triggering event, not a bare "It's your turn") |
| Opt-in interesting event | `"increment"` | yes | "Your friend beat your high score!" |
| Passive update worth surfacing | `"increment"` | no | "Aaron reacted with 🎉" / "Spymaster gave a clue" — bumps the app and adds to the badge count, no ring |
| Recents update without unread | omit | no | Updating a move preview for the actor/spectators, importing your own old messages, todo edits — preview/sort updates without growing the badge |

Rules of thumb:

- **Push only when the user would want their phone to ring.** Required-action moments (turn games, incoming chat message, invite) and high-signal opt-in events (someone beat your score, a friend you know just played). Don't push on every state change — multi-player apps generate dozens of mutations per session, and pushing all of them is spam.
- **Use `unread: "increment"` (without `push`) for "nice to know when you look".** Reactions, partial-progress events from collaborators, another player taking a non-blocking turn (e.g. spymaster choosing a clue while it's not yet your guess phase). This bumps the space, increments its numeric badge, and contributes to the sidebar's RECENTS total — but doesn't ring the device.
- **Omit `unread` for preview/sort updates that should not grow the badge.** This includes a player's own durable action when another mechanism, such as `setTurn`, owns the recipient's unread state. If a player would expect a number to change and nothing else increments it, use `"increment"`.
- **Keep caller unread opt-in exceptional.** User-authored activity is sender-suppressed by default. Set `unreadToCaller: true` only when the event is attributed to the app, system, or agent and is delivered back to the triggering user as a receipt.
- **Choose `targetUserIds` deliberately.** Omit it when every active member — including the actor — should receive the new preview and recents timestamp. For targeted pushes, include only the intended recipients: the next player for "your turn," or the previous record-holder for "friend beat your score." Default sender-suppression handles "don't push the user who triggered the action" for you.
- **Make the push body specific and engaging, not generic.** `"Jacob just took your bishop"` or `"It's your turn to guess the word"` pulls a player back far better than a bare `"It's your turn."` Build the body from whatever just happened — the move, the capture, the card played, the round/phase, the score to beat — and reserve the generic default for when there's genuinely no context. This applies to both `setTurn`'s `push` and `notifyActivity`'s `push`; compute the text in the same mutator that detects the event.
- **Make `preview` self-contained.** It shows up in the recents list with no other context — `"Alice: nice move"` reads better than `"nice move"`.

Concrete examples:

```typescript
// Turn-based game: setTurn alone makes the action discoverable to the next player.
const nextPlayer = computeNextPlayer(state);
const preview = `${currentPlayerName} played ${moveLabel}`;
await setTurn(ctx, {
  userIds: [nextPlayer.userId],
  push: { body: `${preview} — your move` },
});

// Optional: update the sidebar preview for everyone, including the actor.
await notifyActivity(ctx, {
  preview,
  previewTimestamp: input.playedAt,
});

// Same game: spymaster picked a clue — badge + unread for the guessing team, no push
await notifyActivity(ctx, {
  preview: `Spymaster: "${clue}" (${count})`,
  previewTimestamp: Date.now(),
  unread: "increment",
  targetUserIds: guessingTeamUserIds,
});

// High-score game (e.g. poe-jump): someone finished a run — badge bump, no push.
// Default sender-suppression keeps the runner's own count from incrementing, so
// targetUserIds can safely list all members.
const timestamp = Date.now();
await notifyActivity(ctx, {
  preview: `${playerName} scored ${score}`,
  previewTimestamp: timestamp,
  unread: "increment",
  postToChat: {
    messageId: scoreEventId,
    text: `${playerName} scored ${score}`,
    timestamp,
  },
});

// Same game: new player beat the previous record — push the previous record-holder
if (score > previousBest.score && previousBest.userId !== ctx.userId) {
  await notifyActivity(ctx, {
    preview: `${playerName} beat your score (${score})`,
    previewTimestamp: Date.now(),
    unread: "increment",
    targetUserIds: [previousBest.userId],
    push: { body: `${playerName} beat your high score: ${score}` },
  });
}
```

### `addInstanceToRoom()`

Register an app instance as a member of a flat room. The room owns its `$users` roster; member instances mirror that roster via fan-out from the room. Once registered, every `$addUsers` / `$removeUser` against the room reaches the member automatically — including users admitted before the member joined.

Import from the client SDK:

```typescript
import { addInstanceToRoom } from "poe-tiles-sdk/v1/client.js";
```

Call from inside a mutation handler:

```typescript
const mutators = {
  // Running on the chat (a room). Register a launched game with the
  // chat's $room_member_instances so the game inherits the chat's
  // $users via the platform's room fan-out.
  launchGame: async (ctx, input) => {
    await addInstanceToRoom(ctx, {
      storeTypeId: input.gameTypeId,
      instanceId: input.gameInstanceId,
    });
    await ctx.table("games").set({
      itemKey: input.gameInstanceId,
      value: input,
    });
  },
};
```

**Input shape:**

```typescript
{
  storeTypeId: string;   // The app instance being registered
  instanceId: string;
  room?: {                // Optional: explicit room ref
    storeTypeId: string;
    instanceId: string;
  };
}
```

- **Omit `room`** when the calling store IS the room (the common `launchGame`-style case — the helper dispatches to the local store).
- **Pass `room`** when the calling store is a *member* of the room and needs to register another app instance on the room's `$room_member_instances`. App-level mutators cannot read the local `$$system:room` row to auto-detect role, so the caller specifies it.

Idempotent on re-call (the platform mutator's `set` overwrites the identically-keyed row). Safe to race with the client-side `<poe-tile room="inherit">` flow — both converge on the same row.

The platform enforces a **single-room invariant**: if the target instance is already a member of a different room (its `$$system:room` points elsewhere) or is itself a room, the dispatch throws `RoomMembershipConflictError` and the row never lands. An instance can be a member of at most one room at a time.

### `getCurrentUserId()`

Read the current user's `userId` from a synced-store client.

```typescript
import { getCurrentUserId } from "poe-tiles-sdk/v1/client.js";

// Once at app mount:
const userId = await getCurrentUserId(store);
```

`store.userId` does not exist by design — the user identity lives in the query/mutator `ctx`. This helper runs a one-shot query that resolves to `tx.userId`, which is the recommended way to read it from UI code (effects, async resources, manual reads). For per-render reactive access, prefer reading `tx.userId` inside a `store.subscribe()` query callback.

```typescript
// SolidJS / async-init pattern:
const [userIdResource] = createResource(
  () => store,
  (s) => getCurrentUserId(s),
);
```

## Platform Helpers

Small utilities for detecting or configuring the runtime environment. Safe to call from any Poe tile entry.

### `createVerticalScrollBounceMount()`

Create an inner render target inside a root element and opt the root into native vertical pull bounce, even when the app's content is shorter than the viewport. Use this for the normal iframe-document case where `#root` is the top-level scroll container.

Apps scaffolded from the official templates already call this in `entry.tsx`, so most apps do not need to add it manually.

```typescript
import { createVerticalScrollBounceMount } from "poe-tiles-sdk/v1/client.js";

const root = document.getElementById("root");
if (root) {
  const appRoot = createVerticalScrollBounceMount(root);
  renderApp(appRoot);
}
```

The helper clears `root` and appends one generated content wrapper on every platform. Inside the iOS app, it also applies vertical overflow/momentum styles to `root` and makes the wrapper at least `calc(100% + 1px)` tall. The 1px overflow is intentional: it is the smallest reliable amount needed for WKWebView to enter the native rubber-band path.

### `installVerticalScrollBounce()`

Opt a specific custom scroll area into native vertical pull bounce. Use this when only part of the app should bounce, such as a chat message list, while settings/invite/member panels should keep their own behavior.

```typescript
import { installVerticalScrollBounce } from "poe-tiles-sdk/v1/client.js";

const cleanup = installVerticalScrollBounce({
  scrollElement: messagesScroller,
  contentElement: messagesList,
});
```

`contentElement` must be a descendant of `scrollElement`. The helper returns a cleanup function that restores the previous inline styles. Outside the iOS app it validates the input and otherwise no-ops, so desktop, mobile web, and Android do not get a forced 1px scroll range. If the content later grows taller than the viewport, the same element remains the normal scroll container; no re-install is needed.

### `isIosApp()`

Returns `true` when running inside the iOS app WebView, including sandboxed app iframes. Use this only for behavior that depends on the native app shell; use [`isIosWebkit()`](#isioswebkit) for broader iOS WebKit checks.

```typescript
import { isIosApp } from "poe-tiles-sdk/v1/client.js";

if (isIosApp()) {
  // Native-app-only iOS behavior
}
```

### `isAndroidApp()`

Returns `true` when running inside the Android app WebView, including sandboxed app iframes. The Android counterpart of [`isIosApp()`](#isiosapp); use it for behavior that depends on the native Android app shell. (There is no `isAndroidWebkit()` — the Android WebView is Chromium, not WebKit.)

```typescript
import { isAndroidApp } from "poe-tiles-sdk/v1/client.js";

if (isAndroidApp()) {
  // Native-app-only Android behavior
}
```

### `isIosWebkit()`

Returns `true` when running in iOS Safari or WKWebView (including the iOS app). Use only for genuine platform differences — most code should be platform-agnostic.

```typescript
import { isIosWebkit } from "poe-tiles-sdk/v1/client.js";

if (isIosWebkit()) {
  // iOS-specific workaround
}
```

### `isMobileLikeClient()`

Returns `true` when the app is running inside the iOS or Android app **or** in a browser whose primary pointer is coarse (phones, tablets, touchscreen laptops in tablet mode). Returns `false` on regular desktops with a mouse and in Node / SSR contexts.

Use to gate UI that only makes sense on touch-primary devices — touch-only controls or mobile-specific install hints.

```typescript
import { isMobileLikeClient } from "poe-tiles-sdk/v1/client.js";

if (isMobileLikeClient()) {
  // Render the touch joystick.
}
```

### `applyNativeAppGestureOverrides()`

Suppress default browser gestures (text selection, the iOS callout menu, and native link-drag) inside the native app's WebView, so the app feels like a native mobile app. Opt-in per app — call once at app startup (e.g. in `entry.tsx`).

Inputs, textareas, and contenteditable elements are opted back in so users can still select and copy text they've typed.

No-op outside the native app WebView — desktop browsers, iOS Safari, and Android Chrome keep their default behavior. Idempotent.

```typescript
import { applyNativeAppGestureOverrides } from "poe-tiles-sdk/v1/client.js";

applyNativeAppGestureOverrides();
```

### `suppressLongPressMagnifier()`

Suppress the iOS long-press magnifier loupe on a hold/drag gameplay surface — a game canvas, a board, a draggable piece. Opt-in per element.

`applyNativeAppGestureOverrides()` stops the selection callout and text selection, but on iOS it does **not** stop the round magnifier loupe WebKit shows once a still finger starts its text-selection gesture. That loupe fires even over non-selectable content, so a press-and-hold-to-charge or drag interaction pops a magnifier mid-play. CSS can't reach it; WebKit only withholds the gesture when the page cancels `touchstart`, which is what this helper does.

Pass the gameplay element. The helper installs a non-passive `touchstart` listener that calls `preventDefault()` on it, and returns a function that removes the listener (call it on unmount). Applies on all iOS WebKit; a no-op that returns a no-op remover elsewhere (Android, desktop, server).

**Scope it deliberately.** Cancelling `touchstart` also cancels that element's other native touch defaults — the synthesized `click`, double-tap zoom, and touch-initiated scrolling. Use the plain call only where a pointer-driven press or drag *is* the interaction (input from `pointerdown` / `pointerup`, no `click` handlers on the surface). An element that must scroll natively cannot use the helper at all.

**Dual-mode surfaces (`preserveTaps`).** If the same elements support drag *and* tap, and the tap action runs on `click` handlers (tap-to-move board cells, tap-to-place racks — `click` is also how keyboard activation reaches `<button>` cells), pass `{ preserveTaps: true }`. Quick still touch taps are then re-dispatched as a synthetic bubbling `click` at the touched element, so existing click handlers and framework event delegation keep working; holds and drags produce no click; mouse, keyboard, and non-iOS platforms are untouched. The synthetic click is `isTrusted: false` and does not focus inputs — never point this mode at form fields or navigation links.

```typescript
import { suppressLongPressMagnifier } from "poe-tiles-sdk/v1/client.js";

// Pointer-driven canvas — plain call:
const canvas = document.querySelector("canvas")!;
const removeMagnifierSuppression = suppressLongPressMagnifier(canvas);

// Tap+drag board whose cells act on click — preserve taps:
const board = document.getElementById("board")!;
const removeBoardSuppression = suppressLongPressMagnifier(board, {
  preserveTaps: true,
});

// later, on teardown:
removeMagnifierSuppression();
removeBoardSuppression();
```

### `installKeyboardLayoutInset()`

Keep your app's layout above the iOS on-screen keyboard. On iOS the WKWebView does **not** resize when the keyboard opens — it just draws the keyboard on top of your content, so a bottom-anchored input or button ends up hidden behind it. Call this once at startup to opt in: the native shell then shrinks your scroll container (`#root` by default) by the live keyboard height, so the space the keyboard occupies is removed from your layout and bottom-anchored content stays visible. It animates in sync with the keyboard and is a **no-op outside the iOS app** (desktop, Safari, Chrome, Android are unaffected — they resize or scroll natively).

```typescript
import { installKeyboardLayoutInset } from "poe-tiles-sdk/v1/client.js";

installKeyboardLayoutInset(); // shrinks #root; call once at startup
installKeyboardLayoutInset({ selector: ".app-root" }); // custom container
```

Use it for a **full-viewport app that owns its own keyboard layout** — one with a scroll scaffold (`html, body { height: 100dvh; overflow: hidden }` and the container `overflow-y: auto`) and a docked input bar, like a chat composer. Registering also disables the WebView's native document scrolling while the app is mounted (so a drag with the keyboard up can't push your fixed chrome off-screen).

**Consequence — a non-docked input needs help.** Because registering suppresses WebKit's native scroll-to-focused, an input that lives in ordinary scroll flow (not docked above the keyboard) is no longer auto-revealed when it's focused — the keyboard will cover it. You have two options: dock the input's controls above the keyboard (a bottom bar that rides the shrunk container), or scroll them into view yourself with `createKeyboardFocusScroller()` below.

### `createKeyboardFocusScroller()`

The companion to `installKeyboardLayoutInset()` for the scroll-it-yourself case: it scrolls a focused input's controls above the keyboard. On focus it eases the scroll container each animation frame so the controls ride up **with** the rising keyboard (rather than the keyboard covering the input and the page snapping afterward), and a manual drag aborts it. It's a no-op where the browser's own scroll-to-focused already reveals the input, so it's safe to leave in for every platform.

Wire it to the element wrapping the input **and** its buttons (e.g. the `<form>`): attach `ref` to that element, `onFocusIn` as its focus handler, and call `dispose()` on unmount.

```tsx
import {
  createKeyboardFocusScroller,
  installKeyboardLayoutInset,
} from "poe-tiles-sdk/v1/client.js";
import { onCleanup } from "solid-js";

// once at startup:
installKeyboardLayoutInset();

// in the component that renders the input (SolidJS shown; same idea in React/Preact):
function GuessForm() {
  const scroller = createKeyboardFocusScroller();
  onCleanup(scroller.dispose);
  return (
    <form ref={scroller.ref} onFocusIn={scroller.onFocusIn} class="pb-4">
      <input placeholder="Your guess…" />
      <button type="submit">Guess</button>
    </form>
  );
}
```

Options: `scrollRoot` (element or getter; defaults to the `#root` element) and `maxDurationMs` (how long to keep tracking the keyboard's rise; defaults to 800). Add a little bottom padding (e.g. `pb-4`) below the last control so it doesn't sit flush against the keyboard.

## Framework Hooks

### React — `useLiveQuery` (`poe-tiles-sdk/v1/react`)

A React hook that subscribes to a live store query. Handles subscription lifecycle automatically and re-renders when data changes.

```typescript
import { useLiveQuery } from "poe-tiles-sdk/v1/react";

function App({ store }) {
  const { data: items, isLoading } = useLiveQuery(store, (tx) =>
    tx.table("items").entries().toArray(),
  );

  if (isLoading) return <div>Loading...</div>;

  return (
    <ul>
      {(items ?? []).map(([, item]) => <li key={item.id}>{item.text}</li>)}
    </ul>
  );
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `store` | `InferSyncedStoreClient<Schema> \| null` | The store to subscribe to. Pass `null` to get loading state. |
| `queryFn` | `(tx: QueryContext) => Promise<T>` | Query function run against a read transaction |

**Returns:** `{ data: T | undefined, isLoading: boolean }`

- `data` is `undefined` until the first query result arrives
- When `queryFn` reference changes, previous data is kept until new results arrive
- The hook automatically unsubscribes on unmount

### SolidJS — `createLiveQuery` (`poe-tiles-sdk/v1/solid`)

A SolidJS reactive primitive that subscribes to a live store query. Both parameters are accessors for fine-grained reactivity.

```typescript
import { Show, For } from "solid-js";
import { createLiveQuery } from "poe-tiles-sdk/v1/solid";
import type { InferSyncedStoreClient } from "poe-tiles-sdk/v1/client.js";
import type { MySchema } from "./synced-store/schema";

type MyStoreClient = InferSyncedStoreClient<MySchema>;

function App(props: { store: MyStoreClient }) {
  const { data, isLoading } = createLiveQuery(
    () => props.store,
    () => (tx) => tx.table("items").entries().toArray(),
  );

  return (
    <Show when={!isLoading()} fallback={<div>Loading...</div>}>
      <For each={data() ?? []}>
        {([, item]) => <li>{item.text}</li>}
      </For>
    </Show>
  );
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `storeAccessor` | `Accessor<InferSyncedStoreClient<Schema> \| null>` | Accessor returning the store (or `null` for loading) |
| `queryFnAccessor` | `Accessor<(tx: QueryContext) => Promise<T>>` | Accessor returning the query function |

**Returns:** `{ data: Accessor<T | undefined>, isLoading: Accessor<boolean> }`

- Both params are accessors — SolidJS tracks signal reads for automatic re-subscription
- `onCleanup` handles unsubscription automatically

### SolidJS — `createLiveQueryResource` (`poe-tiles-sdk/v1/solid`)

Suspense-aware sibling of `createLiveQuery`. It subscribes to the same live query shape, but exposes the initial result through a Solid `Resource`; later subscription results mutate that resource.

```typescript
import { For, Suspense } from "solid-js";
import { createLiveQueryResource } from "poe-tiles-sdk/v1/solid";

function App(props: { store: MyStoreClient }) {
  const { data } = createLiveQueryResource(
    () => props.store,
    () => (tx) => tx.table("items").entries().toArray(),
  );

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <For each={data() ?? []}>
        {([, item]) => <li>{item.text}</li>}
      </For>
    </Suspense>
  );
}
```

**Returns:** `{ data: Resource<T | undefined>, isLoading: Accessor<boolean> }`
