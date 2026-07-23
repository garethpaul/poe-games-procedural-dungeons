<!-- owner: jyoung-q -->
# Searchable Tables

Add `searchable` to a table's schema definition to enable cross-app full-text search. Items are indexed automatically as they're created, updated, or deleted.

```typescript
tables: {
  todos: {
    schema: table(z.object({
      id: z.string(),
      title: z.string(),
      createdAt: z.number(),
    })),
    searchable: { textField: "title", timestampField: "createdAt" },
  },
}
```

## Options

- **`textField`** — the name of the string field to index for full-text search.
- **`timestampField`** — the name of the number field used to order results by recency.

Both fields must exist on the table's value schema. The indexer re-runs whenever a row is written or deleted.

## Querying

Searchable items are surfaced through the platform-wide search experience and through the MCP tool surface — an AI can search across all searchable tables in all apps the user has access to. There's no per-app search API on the store client; the platform owns the search UI and retrieval.
