<!-- owner: jyoung-q -->
# Limitations

## Size Limits

| What | Limit |
|------|-------|
| Key length | 256 bytes (table name + item key) |
| Value size | 1 MB (`JSON.stringify` length) |
| Pull response | 1 MB per pull (loads incrementally) |
| App upload | 50 MB total |

Exceeding key or value limits throws `KeyTooLargeError` / `ValueTooLargeError` at write time.

## Data Types

Values must be valid JSON: `string`, `number`, `boolean`, `null`, arrays, objects.

**Not supported:** `undefined`, `Date`, `BigInt`, `Map`, `Set`, `ArrayBuffer`, class instances. Serialize these (e.g. `Date` → number timestamp, `Map` → entries array) before writing.

## Mutator Constraints

- **Deterministic** — no `Math.random()` or `Date.now()` for unique values inside mutators (they run on both client and server, producing different results). Pass these as input.
- **No external calls** — use [actions](actions.md) for APIs.
- **No server-only data** — `ctx.serverOnly()` throws on the client. Guard with `if (ctx.isServer)`.
- **No other users' private data** — `ctx.privateOfUser(otherUserId)` throws on the client.
- **No toggles** — pass explicit values, not `!current.done`. See [mutator-rules.md](mutator-rules.md).

## Action Constraints

- Server-only — no optimistic UI update.
- Network latency applies.
- `ctx.enqueueAction()` is a no-op on the client.

## Connection Rules

- **One client per tab** — duplicate `clientId` kicks the first client (code 4000).
- **Terminal disconnections** won't reconnect:
  - `4000` — Kicked (duplicate clientId)
  - `4001` — Auth failed
  - `4002` — Library version mismatch (reload needed)
- Normal disconnections (`1000`, `1006`) auto-reconnect with backoff.

## Conflict Resolution

**Last-writer-wins at the key level.** No field-level merging, CRDTs, or custom conflict callbacks.

Design tip: use fine-grained keys to minimize conflicts (one key per field rather than one key per object) when you care about concurrent edits to different fields of the same logical record.

## Optimistic Lock Conflicts

When two clients write the same key concurrently, the server retries automatically (up to 3 times). If retries fail, the client re-pushes on the next cycle. Under high contention you may see increased latency or `onBackgroundError` / `onFailedMutation` callbacks.

## Storage Eviction

When cached data exceeds the pull budget (1.2× threshold), the client evicts least-important data. Evicted data is re-fetched from the server on next pull.
