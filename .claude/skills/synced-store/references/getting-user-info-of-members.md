<!-- owner: jyoung-q -->
# Getting User Info of Members

Poe auto-populates three `$`-prefixed system tables when users connect to an app instance. Use them to render member lists, leaderboards, chat avatars, or anywhere else you need a user's display name or profile picture. Apps using `poe-tiles-sdk`'s `defineSchema` get these tables typed automatically — you do not declare them.

## Table of Contents
- [`$userInfo` — profile data](#userinfo--profile-data)
- [`$users` — membership roster](#users--membership-roster)
- [Rendering co-player avatars](#rendering-co-player-avatars)
- [`$permissions` — permission grants](#permissions--permission-grants)
- [Current user in the UI](#current-user-in-the-ui)
- [`getCurrentUserId` helper](#getcurrentuserid-helper)
- [`getUserInfo` helper](#getuserinfo-helper)
- [`$$system:createdBy` — who spawned this instance](#system-createdby--who-spawned-this-instance)

## `$userInfo` — profile data

ItemKey is the userId.

```typescript
type PoeUserInfo = {
  userId: string;
  username: string;
  displayName: string;
  profilePicture: string;   // URL
  isDev?: boolean;          // synthetic dev user
  _pendingSync?: true;      // optimistic first-mount row, omitted after server sync
};
```

Retained after a user is removed, so apps can still render historical content (past messages, past moves) with the original author's name and avatar.

## `$users` — membership roster

Tracks who has joined the store instance. ItemKey is the userId.

```typescript
type UserMembership = {
  userId: string;
  addedAt: number;          // timestamp
  addedBy: string;          // userId of who added them, "system" for auto-add
  removedAt?: number;       // set when removed
  removedBy?: string;
  isDev?: boolean;
  _pendingSync?: true;      // optimistic first-mount row, omitted after server sync
};

// All current members
store.subscribe(
  (tx) => tx.table("$users").entries().toArray(),
  (entries) => {
    const members = entries
      .map(([, v]) => v as UserMembership)
      .filter((u) => !u.removedAt);
  },
);
```

When a newly-created tile first mounts, the kernel may seed `$$system.room`,
`$users`, and `$userInfo` optimistically before the first server pull. Those
temporary rows carry `_pendingSync: true`; the authoritative server rows omit
the field.

## Rendering co-player avatars

Showing the people a user is playing with **and against** — their faces, where
the action is — is a core part of what makes a social game rewarding, not a
nice-to-have. It is the shift online poker made in the early 2010s, when player
avatars and profile pictures replaced anonymous names around the table: an
otherwise anonymous game became a moment between people.
Render co-players and opponents beside their in-app representation (their seat,
their move, their score row) and at the moments that matter (whose turn it is,
who just moved, the end-of-game results).

The recipe is: enumerate current members from `$users`, look each up in
`$userInfo` for a name + avatar, and render them — designing for the user who
has not set a photo yet (fall back to initials, never a broken image).

```typescript
// Subscribe to the current members and their profiles together. The table
// reads are async, so the subscribe query must AWAIT them (the callback
// receives the resolved value). Read each user id from the row VALUE
// (`UserMembership.userId` / `PoeUserInfo.userId`), not the entry key —
// `entries().toArray()` yields `[EntryKey, value]` and `EntryKey` is an object
// (`{ itemKey, sortKey? }`), not the string user id.
store.subscribe(
  async (tx) => {
    const [memberships, infos] = await Promise.all([
      tx.table("$users").entries().toArray(),
      tx.table("$userInfo").entries().toArray(),
    ]);
    const infoByUser = new Map(
      infos.map(([, info]) => [(info as PoeUserInfo).userId, info as PoeUserInfo]),
    );
    return memberships
      .map(([, u]) => u as UserMembership)
      .filter((u) => !u.removedAt)
      .map((u) => {
        const info = infoByUser.get(u.userId);
        // The platform normalizes an absent profilePicture to "" (not
        // undefined), so treat the empty string as missing → initials fallback.
        const photo = info?.profilePicture ? info.profilePicture : null;
        // displayName is also normalized to "" (not undefined) when unset, so
        // treat empty as missing and fall back to username, then a generic
        // label. A not-yet-resolved member profile can carry internal ids
        // (`u_<hex>` / `private-...`) in displayName/username — never render
        // those as a name.
        const usable = [info?.displayName, info?.username].find(
          (v) => v && !/^u_[0-9a-f]{32}$/.test(v) && !v.startsWith("private-"),
        );
        const name = usable || "Player";
        return {
          userId: u.userId,
          displayName: name,
          profilePicture: photo,
          // Avatar derives nothing from displayName — pass `initials` yourself.
          // First letters of up to two name words, e.g. "Ada Lovelace" → "AL".
          initials:
            name
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase() ?? "")
              .join("") || "?",
        };
      });
  },
  (players) => renderPlayers(players),
);
```

Design for the missing photo. A user who has not set a `profilePicture` must
still read as a person — show their initials (first letters of `displayName`)
on a colored chip, never a broken `<img>` or an empty circle.

Standalone creator/game tiles should render people in the game's own visual
style. Pass or derive initials yourself for the fallback; do not rely on
`displayName` being inferred automatically.


## `$permissions` — permission grants

ItemKey is `{userId}/{permission}`. Rows are hard-deleted on revocation.

```typescript
type UserPermission = {
  userId: string;
  permission: string;
  grantedAt: number;
  grantedBy: string;
};

// In a mutator
const perm = await ctx.table("$permissions").get(`${ctx.userId}/admin`);
const isAdmin = perm !== undefined;
```

## Current user in the UI

`ctx.userId` is only exposed to mutators and subscribe/query callbacks — not to code that just holds a store reference. Inside a subscribe/query callback, read the current user's row directly:

```typescript
const [myInfo, setMyInfo] = useState<PoeUserInfo | null>(null);

useEffect(() => {
  const unsub = store.subscribe(
    (tx) => tx.table("$userInfo").get(tx.userId),
    (info) => setMyInfo(info ?? null),
  );
  return unsub;
}, [store]);
```

## `getCurrentUserId` helper

When you only need the userId itself (not the full profile) and you're outside a subscribe/query callback — e.g. in an async init hook, a SolidJS resource, or a one-shot read at app mount — use `getCurrentUserId`:

```typescript
import { getCurrentUserId } from "poe-tiles-sdk/v1/client.js";

// Once at app mount:
const userId = await getCurrentUserId(store);
```

It runs a one-shot query that resolves to `tx.userId`. For per-render reactive access, prefer reading `tx.userId` inside a `store.subscribe()` query callback (see "Current user in the UI" above).

## `getUserInfo` helper

`getUserInfo` from `poe-tiles-sdk/v1/shared.js` works anywhere you have a `ctx` (mutators, query callbacks, subscribe callbacks):

```typescript
import { getUserInfo } from "poe-tiles-sdk/v1/shared.js";

const info = await getUserInfo(ctx, ctx.userId);
// info?.username, info?.displayName, info?.profilePicture
```

## `$$system:createdBy` — who spawned this instance

Records the app instance that originally opened the current one (via `apps.openChild` or analogous platform entry point). Useful for "open the parent" affordances, attribution in shared timelines, and analytics.

```typescript
type CreatedByValue = {
  storeTypeId: string;
  instanceId: string;
};

// In a mutator or subscribe/query callback
const spawner = await ctx.table("$$system").get("createdBy");
if (spawner) {
  // spawner.storeTypeId, spawner.instanceId
}
```

Semantics:

- **First-writer-wins.** Written by the platform on the first request that arrives with a `parent` origin. Never overwritten — even if a different parent later opens the same instance, the original spawner stays recorded.
- **Absent for root apps.** Apps opened directly (not via `apps.openChild`) have no `createdBy` row.
- **Absent for cross-store fan-out targets.** Instances first reached only via a system mutator's `mutateExternal` (e.g. a room dispatching `$addUsers` to a member) do NOT record `createdBy` — the row reflects only direct opens.
- **Absent for legacy instances.** Stores that existed before this feature shipped will not have the row.
- **Not used for trust.** `createdBy` is observational. Authorize decisions continue to use the live origin and `$$system:room`.

App code must always tolerate `undefined`.

## Do Not Write to These Tables

App mutators can read but not write `$userInfo`, `$users`, `$permissions`, or `$$system`. Only the platform's built-in system mutators and the platform's `beforeMutations` hook produce changes. Treat them as read-only tables populated by the platform.
