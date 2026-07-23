// owner: jyoung-q
/**
 * Mobile viewport smoke test.
 *
 * Runs on the `mobile-viewport` Playwright project (iPhone 13 viewport, Chromium).
 * What this test does and does NOT cover:
 *
 * 1. Asserts the viewport meta tag includes `viewport-fit=cover` — required
 *    for `env(safe-area-inset-*)` to return non-zero values on devices with
 *    notches / home indicators.
 * 2. Asserts no `position: fixed`/`absolute` element has its bounding-rect
 *    bottom past the visible viewport. Catches bottom-pinned controls with
 *    over-large offsets, negative `bottom` values, and oversized heights or
 *    shifted `top`+`height` layouts.
 *
 * Note: Playwright's iPhone 13 emulation has a static viewport — there's no
 * dynamic Safari toolbar — so on this runner `100vh === 100dvh` and a
 * `top: 0; height: 100vh` shell will NOT trigger Assertion 2 here. The real
 * `100vh`-vs-`100dvh` regression must be caught on real iOS Safari.
 *
 * The test runs against whatever index.html the framework template ships
 * (vanilla-js / react / preact / solidjs) and whichever boot path the
 * scaffolder chose (todo example or `--blank`). We use `#root > *` as the
 * readiness signal because both modes mount their UI inside `#root` (todo
 * renders `#todo-input`, `--blank` renders `#app-heading`); waiting for any
 * direct child keeps the test mode-agnostic.
 */
import { test, expect } from "@playwright/test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import {
	TestServer,
	waitForBlobFrame,
} from "poe-tiles-sdk/v1/test-utils/playwright.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, "../dist");

const server = new TestServer();

test.beforeAll(async () => {
	if (!existsSync(join(DIST_DIR, "index.html"))) {
		throw new Error('dist/index.html not found. Run "bun run build" first.');
	}

	await server.start();
	await server.registerTile({
		typeId: "procedural-dungeon",
		content: { type: "directory", dir: DIST_DIR },
	});
});

test.afterAll(() => {
	server.close();
});

function sessionUrl(config: { instanceId: string }): string {
	return server.sessionUrl({
		tileTypeId: "procedural-dungeon",
		instanceId: config.instanceId,
		userId: "alice",
		clientId: "client-alice",
	});
}

test.describe("Mobile viewport smoke test", () => {
	test("declares viewport-fit=cover and no positioned element overflows the visible iPhone-13 viewport", async ({
		page,
	}) => {
		await page.goto(sessionUrl({ instanceId: "mobile-viewport-smoke" }));

		const frame = await waitForBlobFrame(page);
		await expect(frame.locator("#root > *").first()).toBeVisible({
			timeout: 15_000,
		});

		const viewportContent = await frame.evaluate(() => {
			const meta = document.querySelector(
				'meta[name="viewport"]',
			) as HTMLMetaElement | null;
			return meta?.content ?? "";
		});
		expect(viewportContent).toContain("viewport-fit=cover");

		const offscreenElements = await frame.evaluate(() => {
			const viewportHeight = window.innerHeight;
			const isPositioned = (el: Element): boolean => {
				const position = window.getComputedStyle(el).position;
				return position === "fixed" || position === "absolute";
			};
			const isVisibleOverflow = (rect: DOMRect): boolean =>
				rect.width > 0 && rect.height > 0 && rect.bottom > viewportHeight + 2;
			return [...document.querySelectorAll("*")]
				.filter(isPositioned)
				.map((el) => ({ el, rect: el.getBoundingClientRect() }))
				.filter(({ rect }) => isVisibleOverflow(rect))
				.map(({ el, rect }) => ({
					selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ""),
					rectBottom: rect.bottom,
					viewportHeight,
				}));
		});
		expect(
			offscreenElements,
			`Positioned elements rendered below the visible viewport: ${JSON.stringify(
				offscreenElements,
			)}`,
		).toEqual([]);
	});
});
