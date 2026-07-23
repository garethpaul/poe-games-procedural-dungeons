<!-- owner: jyoung-q -->
# Sandbox restrictions

Apps run in a blob-URL iframe sandboxed with `allow-scripts allow-forms` only. Same-origin and top-navigation are off, so several browser APIs throw or silently fail:

- **Storage APIs blocked.** `localStorage`, `sessionStorage`, `IndexedDB`, and cookies all throw — there is no `allow-same-origin`. Don't reach for `localStorage` to survive refresh; it won't work. Persist per-user state in a `privateOfUser(self)` table and shared state in a public table.
- **No top-level URL navigation.** `window.location.href = …`, `location.assign`, top-level `window.open`, `target="_top"`, and cross-origin `history.pushState` all fail. To switch apps, call `Poe.open({ typeId, instanceId, openProps? })` from `poe-tiles-sdk`. Outbound links work via `<a target="_blank" rel="noopener">`.
- **`window.location.origin` is `"null"`.** Use `Poe.topOrigin` for an absolute host URL.
- **No cross-frame DOM access.** Reading the parent document or any other frame is blocked. Talk to the host via the SDK's `postMessage` wrappers.
