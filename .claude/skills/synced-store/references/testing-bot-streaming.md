<!-- owner: jyoung-q -->
# Testing: Bot Streaming

`createPoeTileTestHarness` supports testing `Poe.stream()` and `Poe.call()` — pass a `getBotResponse` handler when creating the harness.

## Basic Usage

```typescript
import { createPoeTileTestHarness, textResponses } from "poe-tiles-sdk/v1/test-utils.js";

test("stream bot response", async () => {
  const harness = createPoeTileTestHarness({
    getBotResponse: textResponses(["Hello ", "World!"]),
  });
  const { Poe } = await harness.createClient();

  const chunks = [];
  for await (const chunk of Poe.stream({
    botName: "Claude-3.5-Sonnet",
    prompts: "Hi",
  })) {
    chunks.push(chunk);
  }

  expect(chunks).toHaveLength(2);
  expect(chunks[0].text).toBe("Hello ");
  expect(chunks[1].text).toBe("World!");

  harness.dispose();
});
```

## Response Helpers

| Helper | Produces |
|--------|----------|
| `textResponse(str)` | Single-chunk text response |
| `textResponses([str, ...])` | Multiple chunks for one streaming call |
| `sequentialResponses([r1, r2, ...])` | Different response for each successive call |
| `errorResponse(err)` | Simulates an error during streaming |

## Custom `getBotResponse`

For fine-grained control, provide a function that returns an async iterable of chunks based on the request:

```typescript
const harness = createPoeTileTestHarness({
  getBotResponse: async function* (request) {
    if (request.botName === "GPT-4") {
      yield { type: "text", text: "from GPT" };
    } else {
      yield { type: "text", text: "from default" };
    }
  },
});
```

The request object mirrors the production shape (botName, prompts, tools, etc.), so you can branch on any field the application uses.

## When to Use

- **Deterministic unit tests for AI-driven flows** — no real API calls, no flakiness, cheap to run thousands of times.
- **Error-path coverage** — simulate provider errors without needing quota or auth setup.

For action-level tests (server-side actions calling platform services), see [platform.md](platform.md) for the mock platform caller pattern.
