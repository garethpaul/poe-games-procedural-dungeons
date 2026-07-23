// owner: jyoung-q
//
// Captures a square screenshot that can replace the default `profilePicture`
// in `.poe-tile.json`. Drive via:
//   bun run regenerate-screenshot
// which builds the app and writes `assets/screenshot.png`. If you point
// `profilePicture` at that file, commit it with the rest of the tile.
import { test } from "@playwright/test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import {
	TestServer,
	waitForBlobFrame,
} from "poe-tiles-sdk/v1/test-utils/playwright.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, "../dist");
const ASSETS_DIR = join(__dirname, "../assets");
const SCREENSHOT_PATH = join(ASSETS_DIR, "screenshot.png");
const ICON_PATH = join(ASSETS_DIR, "icon.png");

const server = new TestServer();

// This file is an asset generator, not a CI test: it boots a full TestServer
// + blob iframe purely to capture this tile's marketing screenshot
// (assets/screenshot.png). It asserts nothing your e2e
// suite doesn't already cover, so it is skipped in the default Playwright
// suite to keep CI fast. Regenerate the screenshot on demand with
// `bun run regenerate-screenshot`.
test.skip(
	!process.env["REGEN_SCREENSHOTS"],
	"Asset generator — run `bun run regenerate-screenshot`, not the default suite.",
);

test.beforeAll(async () => {
	if (!existsSync(join(DIST_DIR, "index.html"))) {
		throw new Error('dist/index.html not found. Run "bun run build" first.');
	}
	mkdirSync(ASSETS_DIR, { recursive: true });
	await server.start();
	await server.registerTile({
		typeId: "procedural-dungeon",
		content: { type: "directory", dir: DIST_DIR },
	});
});

test.afterAll(async () => {
	await server.closeAndWaitForTesting();
});

// Square mobile viewport (360x360 CSS px) with 2x DPR. CSS pixels stay
// below Tailwind's `sm` breakpoint (640px) so apps render their actual
// mobile layout; the 2x DPR keeps the output PNG at 720x720.
test.use({
	viewport: { width: 360, height: 360 },
	deviceScaleFactor: 2,
});

test("capture profile picture", async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto(
		server.sessionUrl({
			tileTypeId: "procedural-dungeon",
			instanceId: "screenshot",
			userId: "alice",
			clientId: "client-alice",
		}),
	);
	const frame = await waitForBlobFrame(page);
	await frame
		.locator('#dungeon-host[data-scene-ready="1"]')
		.waitFor({ state: "attached", timeout: 30_000 });
	// Instant forge so the capture shows a settled dungeon, not the reveal.
	await frame.locator("#hudForge").click();
	await frame.locator("#tAnim").uncheck();
	await frame.locator("#forge").click();
	await frame.locator("#dsub").filter({ hasText: "connected" }).waitFor();
	await frame.locator("#hudForge").click();
	// Walk a few tiles so the shot is genuinely in-action (hero + HUD).
	await frame.evaluate(() => {
		const g = (window as unknown as { __dfGame: { state: () => { cell: { x: number; y: number } }; moveTo: (x: number, y: number) => boolean } }).__dfGame;
		const c = g.state().cell;
		g.moveTo(c.x + 4, c.y + 4);
	});
	await page.waitForTimeout(2000);
	await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });

	// Full-bleed icon: hide the UI chrome and zoom into the dungeon so the
	// listing icon is pure game world.
	await frame.evaluate(() => {
		document
			.querySelectorAll<HTMLElement>("#panel, .df-hud, .df-hint, .df-help")
			.forEach((el) => (el.style.display = "none"));
	});
	await page.mouse.move(180, 180);
	await page.mouse.wheel(0, -400);
	await page.waitForTimeout(600);
	await page.screenshot({ path: ICON_PATH, fullPage: false });
});

// Gallery screenshots for the tile listing (wired into
// `.poe-tile.json → screenshots`). Same REGEN_SCREENSHOTS guard.
test.describe("gallery", () => {
	// 1x DPR + a modest viewport keep each PNG under the platform's 512 KB
	// screenshot limit.
	test.use({
		viewport: { width: 1024, height: 640 },
		deviceScaleFactor: 1,
	});

	test("capture gallery shots", async ({ page }) => {
		test.setTimeout(120_000);
		await page.goto(
			server.sessionUrl({
				tileTypeId: "procedural-dungeon",
				instanceId: "screenshot-gallery",
				userId: "alice",
				clientId: "client-alice",
			}),
		);
		const frame = await waitForBlobFrame(page);
		await frame
			.locator('#dungeon-host[data-scene-ready="1"]')
			.waitFor({ state: "attached", timeout: 30_000 });
		// Instant (non-animated) forges so every capture is a settled dungeon.
		await frame.locator("#hudForge").click();
		await frame.locator("#tAnim").uncheck();

		const scrollPanelTop = () =>
			frame.evaluate(() => {
				const panel = document.querySelector("#panel");
				if (panel) panel.scrollTop = 0;
			});
		const walk = (dx: number, dy: number) =>
			frame.evaluate(
				(d: { x: number; y: number }) => {
					const g = (window as unknown as { __dfGame: { state: () => { cell: { x: number; y: number } }; moveTo: (x: number, y: number) => boolean } }).__dfGame;
					const c = g.state().cell;
					g.moveTo(c.x + d.x, c.y + d.y);
				},
				{ x: dx, y: dy },
			);

		// Shot 1: molten floor mid-crawl — hero, HUD, and the hint line.
		await frame.locator("#seed").fill("31337");
		await frame.locator('#chips .chip[data-t="molten"]').click();
		await frame.locator("#dsub").filter({ hasText: "connected" }).waitFor();
		await frame.locator("#hudForge").click();
		await walk(5, 3);
		await page.waitForTimeout(2200);
		await page.screenshot({
			path: join(ASSETS_DIR, "screenshot-play.png"),
			fullPage: false,
		});

		// Shot 2: the forge panel open over a frost dungeon.
		await frame.locator("#hudForge").click();
		await frame.locator('#chips .chip[data-t="frost"]').click();
		await frame.locator("#dsub").filter({ hasText: "connected" }).waitFor();
		await scrollPanelTop();
		await page.waitForTimeout(1200);
		await page.screenshot({
			path: join(ASSETS_DIR, "screenshot-panel.png"),
			fullPage: false,
		});

		// Shot 3: graph overlay over a verdant dungeon — the procgen showcase.
		await frame.locator('#chips .chip[data-t="verdant"]').click();
		await frame.locator("#dsub").filter({ hasText: "connected" }).waitFor();
		await frame.locator("#tGraph").check();
		await scrollPanelTop();
		await page.waitForTimeout(1200);
		await page.screenshot({
			path: join(ASSETS_DIR, "screenshot-graph.png"),
			fullPage: false,
		});
	});
});
