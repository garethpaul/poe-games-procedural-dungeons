<!-- owner: jyoung-q -->
# Synced-Store UI Subscription Patterns

## Table of Contents
- [React / Preact](#react--preact)
- [SolidJS](#solidjs)
- [System Tables](#system-tables)
- [Store Client API](#store-client-api)

## React / Preact

```typescript
import { useState, useEffect } from "react"; // or "preact/hooks"
import type { TileStoreClient, ItemType } from "../client";

export function App({ store }: { store: TileStoreClient }) {
  const [items, setItems] = useState<ItemType[]>([]);

  useEffect(() => {
    const unsubscribe = store.subscribe(
      (tx) => tx.table("items").entries().toArray(),
      (entries) => {
        setItems(entries.map(([, v]) => v as ItemType).sort((a, b) => a.order - b.order));
      },
    );
    return unsubscribe;
  }, [store]);

  // Mutate — fire-and-forget (optimistic)
  const addItem = () => {
    store.mutate.setItem({ id: crypto.randomUUID(), text: "new" });
  };

  return <ul>{items.map(i => <li key={i.id}>{i.text}</li>)}</ul>;
}
```

**Provider pattern** (React): Create a context + hook so components don't receive `store` as a prop:
```typescript
const StoreContext = createContext<TileStoreClient | null>(null);
export const useStore = () => useContext(StoreContext)!;
// Wrap in entry.tsx: <StoreContext.Provider value={store}><App /></StoreContext.Provider>
```

## SolidJS

```typescript
import { createStore, reconcile } from "solid-js/store";
import { onMount, onCleanup, For } from "solid-js";

export function App(props: { store: TileStoreClient }) {
  const [state, setState] = createStore<{ items: ItemType[] }>({ items: [] });

  onMount(() => {
    const unsub = props.store.subscribeToTable("items", (entries) => {
      const items = (entries as [{ itemKey: string }, ItemType][])
        .map(([, v]) => v)
        .sort((a, b) => a.order - b.order);
      setState("items", reconcile(items, { key: "id" }));
    });
    onCleanup(() => unsub());
  });

  return <For each={state.items}>{(item) => <div>{item.text}</div>}</For>;
}
```

**Key difference**: SolidJS uses `subscribeToTable(name, callback)` instead of `subscribe(query, callback)`. Use `reconcile()` with a key to preserve DOM nodes across updates (see `docs/solidjs-best-practices.md`).

## System Tables

For member profiles, membership roster, current-user lookup in the UI, and permission checks, see [getting-user-info-of-members.md](getting-user-info-of-members.md) — covers `$userInfo`, `$users`, `$permissions`, and the `getUserInfo` helper.

## Store Client API

```typescript
// Mutations (optimistic, returns confirmation promise)
const { confirmed } = await store.mutate.myMutator(input);
await confirmed; // wait for server acknowledgement

// Queries
const value = await store.query((tx) => tx.table("items").get("key"));

// Subscriptions (React)
const unsub = store.subscribe(
  (tx) => tx.table("items").entries().toArray(),
  (result) => { /* called on every change */ },
);
unsub(); // cleanup

// Subscriptions (SolidJS)
const unsub = store.subscribeToTable("items", (entries, changes) => {
  // entries: full snapshot
  // changes: { added: string[], modified: string[], removed: string[] }
});
```
