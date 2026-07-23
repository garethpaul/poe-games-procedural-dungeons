<!-- owner: jyoung-q -->

# Composing apps (advanced)

> **Most apps don't need this.** Build a single app first — one synced-store schema with the right visibility tiers handles role-specific or hidden state without splitting. Read this only when you have a concrete reason to compose (below) or are wiring a multi-user space that launches sub-apps.

## Single app vs composition

**Default: single app.** Spy Words, Chess, Tic-Tac-Toe, polls, whiteboards — all single apps.

Compose into multiple apps **only** when at least one holds:
1. **Sub-experience private to a subset of parent's users** — per-instance privacy beats per-channel ACLs in one giant schema.
2. **Reusable, independently-publishable primitive** — e.g. a "threaded chat" multiple parents embed.
3. **Lifecycles diverge sharply** — parent long-lived (server membership, tournament season), children created / used / archived independently (channels, matches).

**Not enough reasons:** "cleaner architecture", different screens / modes / roles of the same experience, splitting lobby + game. Routes inside one app are simpler than cross-app coordination.

`<poe-tile>` resolves children by `type-id`, which only exists once the child has been **published**. When composing: publish each child first, capture `type-id` from `poe-tiles tiles list`, wire into parent as constants, then republish the parent.

## Picker + detail: split view

When a parent is essentially a picker (server channel list, gallery, lobby) and the "experience" lives in the picked sub-app, prefer **split view** over inline `<poe-tile>` embedding. Split view runs the two apps side-by-side at the root level wherever the manager uses its two-column layout (desktop and tablets), and falls back to a normal forward navigation on phones (in any orientation) and narrow windows — one call site, both form factors:

```javascript
// From the picker app
await Poe.open({
  typeId: pickedAppId,
  instanceId: pickedInstanceId,
  placement: "splitView",
  // Picker is a fixed-width list; opened app gets the rest of the screen.
  viewWidth: "260px",
});
```

Subsequent `placement: "splitView"` calls from the same picker swap the side pane in place, so a single picker drives a single detail pane through many selections without churning its own state.

### Embedding with `<poe-tile>`

Alternative to split view: render a sub-app directly inside the parent's DOM using the `<poe-tile>` custom element. Each `<poe-tile>` instance gets its own synced-store instance scoped to its `instance-id`; the child inherits the parent's room by default.

```html
<poe-tile type-id="my-chat" instance-id="room-42"></poe-tile>
```

```javascript
// Register the element once on entry so the parent can render <poe-tile> in its JSX/HTML.
// `environment` is the same `PostMessageEnvironment` you pass to `createPoe()` — see
// the Initialization snippet in client-api.md for the full wiring.
import {
  createPoe,
  PostMessageEnvironment,
  registerPoeTileElement,
} from "poe-tiles-sdk/v1/client.js";

const environment = new PostMessageEnvironment();
const Poe = createPoe({ environment });
registerPoeTileElement(environment);
```

Use this over `Poe.open({ placement: "splitView" })` when the sub-app should be a real DOM child of the parent (parent's layout drives sizing, multiple sub-apps render simultaneously, parent owns the surrounding chrome). Use split view when the sub-app should behave as a top-level app (own back button, deep links on mobile, swaps in place across selections).

See [`<poe-tile>` attributes](./client-api.md#attributes) for the full attribute reference (including `room="explicit"` + `room-type-id` / `room-instance-id` for cross-room embeds).

See `Poe.open()` in [client-api.md](./client-api.md#poe-open-typeid-instanceid-openprops-isnew-placement-viewwidth) for the full parameter reference.

## Rooms

> **Most apps don't need this.** Refer to this section only when launching a sub-app that breaks out of the current room (e.g. a chat launching a game whose `$users` should differ from the chat's roster, or an app registering members against a foreign room). Standalone apps and simple parent/child embeds inherit the right roster automatically — the platform sets sensible defaults.

### What a room is

A **room** is an app instance whose `$users` roster is the source of truth for membership across a set of related sub-app instances. The platform fans every `$addUsers` / `$removeUser` on the room out to every registered member instance, so sub-apps inherit the roster automatically — including users admitted before the sub-app existed.

Most apps never touch room wiring directly:
- Top-level apps opened from the manager become their own room.
- Children opened via `Poe.open()` or `<poe-tile>` default to inheriting the opener's room.
- Apps just read `$users` and trust the roster.

Reach for the explicit APIs below only when the calling app *is* the room and needs to register sub-apps as members or react when they're added.

### Room launches a sub-app

A parent that *is the room* mints a sub-app instance from its own UI. Two pieces:

1. **Parent-side mutator** — call [`addInstanceToRoom`](./client-api.md#addinstancetoroom) to register the new instance on `$room_member_instances` so the platform fans the parent's `$users` into the sub-app. App-level mutators can't read their own `$$system:room` to auto-detect role, so the caller picks based on what it knows: when the calling store IS the room, omit `room` and the helper dispatches to itself. From a member store registering some *other* instance, pass `room: { storeTypeId, instanceId }` explicitly.
2. **Client** — call `Poe.open({ placement: "splitView" })` to mount the sub-app alongside the parent. The client-side `room: { kind: "inherit" }` fan-out writes the same `$room_member_instances` row idempotently, so racing the mutator and open is safe.

```typescript
// Parent mutator (runs on the room store).
import { addInstanceToRoom } from "poe-tiles-sdk/v1/client.js";

launchSubTile: async (ctx, input) => {
  await addInstanceToRoom(ctx, {
    storeTypeId: input.tileTypeId,
    instanceId: input.appInstanceId,
  });
},
```

```typescript
// Parent client. Mint the instanceId, fire the mutator, open in split view.
// The sub-app inherits the parent's room (the default), and the
// `addInstanceToRoom` registration fans the room's `$users` into it +
// pins its `$$system:room` server-side — so no genesis declaration is
// needed here. (Reach for `Poe.tiles.prepareNewInstances` only when a fresh
// store owns its OWN room/roster — see "child room" below.)
const appInstanceId = generateUUID().slice(0, 8);
await Promise.all([
  store.mutate.launchSubTile!({ tileTypeId: app.id, appInstanceId }),
  Poe.open({
    typeId: app.id,
    instanceId: appInstanceId,
    placement: "splitView",
  }),
]);

// Re-open later (any member). The instance already exists.
Poe.open({ typeId, instanceId, placement: "splitView" });
```

> **Security:** if you persist the launch as a styled, attributed event (transcript row, activity log, "X started Y" announcement), store only `(tileTypeId, appInstanceId)` plus server-trusted launcher identity and resolve the creator handle / app name at render time from `Poe.tiles.get({ typeId: tileTypeId })`. Persisting client-supplied creator handle / app name lets a member call the mutator directly with spoofed values, then the styled UI renders verified-looking attribution on every viewer's screen.

### Room launches a sub-app into its own child room

When the launched app should get a roster of its own instead of inheriting the parent's — e.g. a chat launching a game that only some chat members will join — the launching app does **not** dispatch genesis into the child room itself. Instead, the manager authors the child room's genesis before it opens the launched tile: it builds a `$bootstrapStore` genesis spec (via `buildChildRoomInstances`) that pins each fresh child room's `$$system:room` parent edge and seeds its roster, declares it via `Poe.tiles.prepareNewInstances({ instances })`, then opens the tile. Pass freshly-minted UUID instance ids for the child rooms — never reuse an existing room — so the genesis pins a clean parent edge for each. The parent edge must target a platform-authored `rootGroup` room; arbitrary `self` rooms cannot be used as parent rooms.

### `RoomMembershipConflictError`

`addInstanceToRoom` dispatches `$addTileInstanceToRoom` on the target room store via `ctx.mutateExternal`. When the target store throws `RoomMembershipConflictError` — which happens when:

- The target instance is already a member of a *different* room (`$$system:room` pins to another `memberOf` ref).
- The target instance is itself a room (`{ type: "self" }` or `{ type: "rootGroup" }` already pinned).

— the throw fires **post-commit on the room store**, *not* on the source promise. `ctx.mutateExternal` is fire-and-forget (it returns `void`, not a promise), so the source mutator's `await store.mutate.launchSubTile!(...)` resolves cleanly even when the dispatch later fails. There is no try/catch recovery on the source path.

The single-room invariant means the right defense is upstream: mint a **fresh** `appInstanceId` for every launch (the example above slices a `generateUUID()` for exactly this reason), and never reuse one that already belongs to a foreign room or is itself a room. If you genuinely need to verify post-hoc whether the registration landed, observe the `$room_member_instances` row on the room (the [headless `flat-room` suite](https://github.com/quora-internal/poe2/blob/main/poe-tiles/shared-headless-integration-tests/suites/flat-room.ts) polls for row absence as the canonical signal); a missing row after the dispatch settles is the only client-side surface for the conflict.

### Reacting to a new member instance

The room store can run code when a sub-app is registered (seed per-instance state, log a transcript row, send a notification) via the [`onAddTileInstanceToRoom`](./backend-api.md#system-hooks) system hook. Fires only on first registration; idempotent re-registers are suppressed. Register this hook in the room app's `defineClientConfig({ hooks })` as well as `defineBackendConfig({ hooks })` so prepared launches can render the hook-derived state optimistically before the server result arrives.

### Cross-store dispatch carries the room

When a member dispatches to another store via `ctx.mutateExternal`, the trusted server stamps `ctx.source.room` on the receiver with the source's resolved room ref (a `{ storeTypeId, instanceId }` pair, server-resolved from the source's `$$system:room`). Use this to authorize / scope writes against the same room without trusting client input. See [synced-store `external-stores.md`](../../synced-store/references/external-stores.md) for full semantics.

### Sharing the room

`Poe.room.openInvitePicker()` asks the host to open the Add members invite surface for the calling app instance. The host resolves the caller from trusted RPC context, resolves the caller's canonical room, lets the user add contacts to that room, and keeps share/copy invite links targeted at the calling tile instance. Apps that need the selected users back should use [`Poe.room.pickMembers()`](./client-api.md#poe-room-pickmembers) instead, then validate any resulting app-state writes with `assertRoomMember(ctx, { userId })`.

### Reference: room mode forms

Three places talk about rooms, each with its own representation. They are *the same concept* in three forms:

| Where | Form | Values |
|---|---|---|
| `Poe.open({ room })` (JS) | tagged object, `kind` field | `{ kind: "self" }` · `{ kind: "inherit" }` · `{ kind: "explicit", storeTypeId, instanceId }` |
| `<poe-tile room="…">` (HTML attr) | bare string + companion attrs | `"self"` · `"inherit"` · `"explicit"` (with `room-type-id` / `room-instance-id`) |
| `$$system:room` (stored, server-pinned) | tagged object, `type` field | `{ type: "self" }` · `{ type: "rootGroup" }` · `{ type: "memberOf", storeTypeId, instanceId }` |

The first two are *intents* set when the instance is first opened. The server resolves the intent and pins one stored state:

- `self` stays `self`.
- `explicit` becomes `{ type: "memberOf", ...givenRef }`.
- `inherit` resolves to the opener's room — `memberOf` of the opener's foreign room if it has one, otherwise `memberOf` of the opener itself (which is the room). Falls back to `{ type: "self" }` only when the logical parent cannot be a room (e.g. the manager / `disallowedRoomTypeIds`).

The pin **cannot change afterwards** — the platform enforces a single-room invariant.

See [`Poe.open()` parameters](./client-api.md#poe-open-typeid-instanceid-openprops-isnew-placement-viewwidth) and [`<poe-tile>` attributes](./client-api.md#attributes) for the wire-level form.
