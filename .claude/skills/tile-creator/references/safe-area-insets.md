<!-- owner: jyoung-q -->
# Safe-area-inset CSS variables

The platform exposes four CSS variables on every iframe's `:root`:

| Variable | Default | Notes |
| --- | --- | --- |
| `--poe-safe-area-inset-top` | `env(safe-area-inset-top)` | Notch / status bar clearance |
| `--poe-safe-area-inset-bottom` | `env(safe-area-inset-bottom)` | Home indicator clearance |
| `--poe-safe-area-inset-left` | `env(safe-area-inset-left)` | Left-edge clearance — notch / cutout (e.g. phone in landscape); 0 on most screens |
| `--poe-safe-area-inset-right` | `env(safe-area-inset-right)` | Right-edge clearance — notch / cutout (e.g. phone in landscape); 0 on most screens |

**Use these in place of raw `env(safe-area-inset-*)` whenever you pad against the viewport edge.** The kernel injects the defaults automatically. When the parent app overlays UI on top of the iframe (e.g. a top bar, bottom tab bar, split-view divider), it overrides the relevant variables so the child does not double-pad behind the parent's chrome.

## Consuming the variables

Always include an `env(...)` fallback for non-platform hosts (third-party embedders, dev servers):

```css
.bottom-bar {
  padding-bottom: var(
    --poe-safe-area-inset-bottom,
    env(safe-area-inset-bottom)
  );
}

.top-header {
  padding-top: var(--poe-safe-area-inset-top, env(safe-area-inset-top));
}

/* Inside a tailwind arbitrary value */
class="bottom-[calc(1rem+var(--poe-safe-area-inset-bottom,env(safe-area-inset-bottom)))]"
```

Wrap with `max(..., 0px)` only when you already wrapped the bare `env(...)` value that way — `var(...)` may evaluate to a negative computed value in pathological browser bugs and `max(.., 0px)` guards against that. Most apps just need the bare `var(...)`.

**Don't stop at top/bottom — left/right insets are real too.** They're 0 on most screens, but a notch / camera cutout on a *vertical* edge makes them nonzero. The common case is a phone in landscape, where the notch / Dynamic Island rotates into a ~59px side inset mid-screen — exactly where a composer row sits when the keyboard lifts it. Any control pinned near a horizontal viewport edge (send buttons, side toolbars, FABs) needs the same treatment:

```css
.composer {
  padding-left: calc(1rem + var(--poe-safe-area-inset-left, env(safe-area-inset-left)));
  padding-right: calc(1rem + var(--poe-safe-area-inset-right, env(safe-area-inset-right)));
}
```

The host zeroes whichever sides its own chrome already covers (e.g. the top bar, or the sidebar in wide two-column layouts), so consuming all four variables is always safe — sides you don't touch cost nothing on devices without obstructions. The app scaffold's `#root` rule already pads all four sides; this matters when you hand-roll layout or pin chrome outside `#root`.

## Declaring overrides for a child app

If your app nests another app via `<poe-tile>` and draws chrome on top of its iframe, declare the corresponding insets so the child does not pad behind your chrome.

```html
<!-- Initial value at mount: pass as JSON in an HTML attribute -->
<poe-tile
  type-id="chat"
  instance-id="123"
  safe-area-insets='{"top":48,"bottom":56}'
></poe-tile>
```

```ts
// Update at runtime via the JS property — beats the HTML attribute.
const el = document.querySelector<HTMLElement>("poe-tile")!;
(el as any).safeAreaInsets = { top: 48, bottom: 56 };
// Or use the convenience setter exported from the SDK:
import { setChildSafeAreaInsets } from "poe-tiles-sdk/v1/client.js";
setChildSafeAreaInsets(el, { top: 48, bottom: 56 });
// Clear the override (child resumes device env() defaults):
setChildSafeAreaInsets(el, null);
```

Each side is a CSS px length (number). Sides omitted from the object fall through to the device `env(safe-area-inset-<side>)` default — partial overrides are supported. Values are validated at the platform boundary: non-finite, negative, or values above 2000px are dropped.

Runtime updates are applied without remounting the child iframe — they flow as a `poe:safe-area-insets` postMessage to the child's `contentWindow`, which the child SDK applies inline. Use this for chrome that changes during the session (sidebar open/close, keyboard transitions, orientation flips).

## What not to do

- ❌ `padding-bottom: env(safe-area-inset-bottom);` — ignores parent-app overlays.
- ❌ Setting per-side `0` and the others omitted to "force" no inset — omitted sides already fall through to the device default. Set `0` only when you specifically want to override that side to zero.
- ❌ Posting `poe:safe-area-insets` messages directly from app code — use the `<poe-tile>` setter or `setChildSafeAreaInsets`. The element knows which iframe `contentWindow` to target.
