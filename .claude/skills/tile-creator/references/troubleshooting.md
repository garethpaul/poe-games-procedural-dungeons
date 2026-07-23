<!-- owner: kevlu94 -->
# Troubleshooting

Error codes and failure modes you may hit while building a tile, indexed by
the literal string you're looking at. Each entry says what it means, what the
user experiences, and what your tile should do.

## Bot-access errors

Poe-backed bot calls (`Poe.stream()`, `Poe.call()`) require the current user
to have a usable Poe account. When they don't, you'll encounter one of the
reason codes below — as `access.reason` from `Poe.getPoeBotAccess()` /
`Poe.requestPoeBotAccess()`, or as the `reason` field on a `PoeBotAccessError`
thrown by an unguarded call.

**The fix is the same for all of them** — preflight with
[`Poe.requestPoeBotAccess()`](client-api.md#poe-requestpoebotaccess) so the
platform prompts the user to repair their account, instead of letting the call
fail:

```javascript
async function askAi(prompt) {
  const access = await Poe.requestPoeBotAccess();
  if (!access.canUse) return null; // user declined — keep the feature visible, disabled

  let text = "";
  for await (const chunk of Poe.stream({ botName: "Claude-Sonnet-4.5", prompts: prompt })) {
    if (chunk.isReplaceResponse) text = chunk.text;
    else text += chunk.text;
  }
  return text;
}
```

### `poe_link_required`

- **Means:** the user has no Poe account linked to their Tiles account.
- **User sees (with the preflight):** the platform's "Link your Poe account"
  modal — they can sign in with Poe or paste an API key without leaving your
  tile.
- **Your tile:** call `requestPoeBotAccess()` before the bot call; on
  `{ canUse: false }`, keep the AI feature visible but inert. Don't hide it —
  the user may link later and retry.

### `poe_relink_required`

- **Means:** a Poe account was linked, but its key expired or was revoked.
- **User sees (with the preflight):** the platform's "Reconnect your Poe
  account" modal.
- **Your tile:** same preflight pattern; nothing extra to handle.

### `poe_pay_with_points_required`

- **Means:** the linked Poe account hasn't enabled paying for bot calls with
  Poe points.
- **User sees (with the preflight):** the platform's "Enable Poe points"
  modal.
- **Your tile:** same preflight pattern.

### `poe_bot_backend_unavailable`

- **Means:** Poe-backed bots aren't available in this environment at all
  (nothing the user can fix).
- **User sees (with the preflight):** an informational "AI is unavailable"
  modal.
- **Your tile:** same preflight pattern; consider degrading the AI feature
  with an inline "unavailable here" hint if `getPoeBotAccess()` reports this
  reason at load time.

### `PoeBotAccessError`

Thrown by `Poe.stream()` / `Poe.call()` when the call was made **without** a
successful preflight and the user's access is blocked. Carries a `reason`
field with one of the four codes above. Catch it as a backstop and route into
the same recovery:

```javascript
import { isPoeBotAccessError } from "poe-tiles-sdk/v1/client.js";

try {
  for await (const chunk of Poe.stream({ botName, prompts })) { /* … */ }
} catch (error) {
  if (isPoeBotAccessError(error)) {
    await Poe.requestPoeBotAccess(); // platform prompt; user retries after fixing
    return;
  }
  throw error;
}
```

### `No API key configured for user`

The raw server-side message behind `poe_link_required` on older SDK bundles
that predate `PoeBotAccessError`. If you're seeing this literal string,
[upgrade your app's SDK](cli.md#upgrading-the-sdk-in-an-existing-app) and adopt the
preflight pattern above.

## "This API doesn't exist" / TypeScript can't find a method the docs describe

These docs describe the **latest** published SDK. If TypeScript (or a runtime
`undefined is not a function`) says a documented method doesn't exist, your
app's `poe-tiles-sdk` pin predates the API — see
[Upgrading an existing app's SDK](cli.md#upgrading-the-sdk-in-an-existing-app).
Newer API sections in the [client API reference](client-api.md) carry an
*Added &lt;date&gt;* note you can compare against your pin's `publishedAt`
date.

## `poe-tiles doctor` failures on an older scaffold

If `doctor` complains about a missing `publish-to-poe-tiles` script, your
`vite.config.ts` imports `poeApp` and fails to build, or publishes 404 — your
app predates the platform rename. Work through
[Migrating a pre-rename app](migrating-pre-rename-tiles.md).
