import { test, expect, type Page, type Frame } from "@playwright/test";
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
		tileAllowsTestUsers: true,
	});
});

test.afterAll(() => {
	server.close();
});

function sessionUrl(instanceId: string, userId = "alice"): string {
	return server.sessionUrl({
		tileTypeId: "procedural-dungeon",
		instanceId,
		userId,
		clientId: `client-${userId}`,
	});
}

// The host normally renders the end-of-tile overlay; in tests we acknowledge
// the event and drop a marker so the handoff can be asserted.
const installTileEndHost = async (page: Page) => {
	await page.addInitScript(() => {
		document.addEventListener("poe:room-tile-end", (event) => {
			const detail = (event as CustomEvent<{ acknowledge: () => void }>)
				.detail;
			const overlay = document.createElement("section");
			overlay.setAttribute("data-testid", "tile-end-overlay");
			overlay.textContent = "Official results";
			document.body.appendChild(overlay);
			detail.acknowledge();
		});
	});
};

async function waitForScene(frame: Frame) {
	await expect(
		frame.locator('#dungeon-host[data-scene-ready="1"]'),
	).toBeAttached({ timeout: 30_000 });
}

/* Drive the game through its public API (window.__dfGame inside the blob
   frame) — the same code path as a tap, minus the raycast. */
type GameState = {
	hp: number;
	gold: number;
	over: boolean;
	victory: boolean;
	walking: boolean;
	cell: { x: number; y: number };
	boss: { x: number; y: number } | null;
};
function gameState(frame: Frame): Promise<GameState> {
	return frame.evaluate(
		() =>
			(
				window as unknown as { __dfGame: { state: () => GameState } }
			).__dfGame.state(),
	);
}

test.describe("procedural-dungeon", () => {
	test("boots into the playable crawl: HUD up, hero hint shown, panel tucked away", async ({
		page,
	}) => {
		await page.goto(sessionUrl("pd-boot"));
		const frame = await waitForBlobFrame(page);
		await waitForScene(frame);

		await expect(frame.locator("#hud")).toBeVisible();
		await expect(frame.locator("#hudHpText")).toHaveText("100");
		await expect(frame.locator("#hudGold")).toHaveText("0");
		await expect(frame.locator("#hint")).toBeVisible();
		await expect(frame.locator("#panel")).toBeHidden();

		// The forge panel opens on demand and reflects the generator output.
		await frame.locator("#hudForge").click();
		await expect(frame.locator("#panel")).toBeVisible();
		await expect(frame.locator("#dname")).not.toHaveText("—");
		await expect(frame.locator("#dsub")).toContainText("connected");
		await frame.locator("#hudForge").click();
		await expect(frame.locator("#panel")).toBeHidden();
	});

	test("full run: walk to the boss, terminal state lands, host overlay follows", async ({
		page,
	}) => {
		test.setTimeout(90_000);
		await installTileEndHost(page);
		await page.goto(sessionUrl("pd-run"));
		const frame = await waitForBlobFrame(page);
		await waitForScene(frame);

		// Pin the floor: small deterministic dungeon so the route is short.
		await frame.locator("#hudForge").click();
		await frame.locator("#rooms").evaluate((el) => {
			const input = el as HTMLInputElement;
			input.value = "12";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		// The slider forge is debounced — let it land before the seeded forge,
		// or it would reset the run mid-walk.
		await expect(frame.locator("#sRooms")).toHaveText("12", {
			timeout: 10_000,
		});
		await frame.locator("#seed").fill("4242");
		await frame.locator("#forge").click();
		await expect(frame.locator("#dsub")).toContainText("seed 4242");
		await frame.locator("#hudForge").click();

		// March to the boss via the game API (same path as a tap).
		const start = await gameState(frame);
		expect(start.boss).not.toBeNull();
		const boss = start.boss as { x: number; y: number };
		const moved = await frame.evaluate(
			(target) =>
				(
					window as unknown as {
						__dfGame: { moveTo: (x: number, y: number) => boolean };
					}
				).__dfGame.moveTo(target.x, target.y),
			boss,
		);
		expect(moved).toBe(true);

		// The walk resolves combat en route; wait for the terminal state.
		await expect
			.poll(async () => (await gameState(frame)).over, { timeout: 30_000 })
			.toBe(true);
		const end = await gameState(frame);

		// Decisive banner matches the actual outcome, before the host overlay.
		await expect(frame.locator("#endcard")).toBeVisible({ timeout: 10_000 });
		await expect(frame.locator("#endTitle")).toHaveText(
			end.victory ? /FLOOR CLEARED/ : /YOU FELL/,
		);
		expect(end.gold).toBeGreaterThan(0);

		// The platform end surface opens after the readable beat. (The test
		// host only acknowledges display — it never resolves an outcome — so
		// the in-tile PLAY AGAIN fallback is exercised in unit tests instead.)
		await expect(
			page.locator('[data-testid="tile-end-overlay"]'),
		).toBeVisible({ timeout: 15_000 });

		// Reforging from the panel starts a fresh run: full HP, gold reset.
		await frame.locator("#hudForge").click();
		await frame.locator("#forge").click();
		await expect(frame.locator("#hudHpText")).toHaveText("100", {
			timeout: 15_000,
		});
		await expect(frame.locator("#hudGold")).toHaveText("0");
		await expect(frame.locator("#endcard")).toBeHidden();
	});

	test("multiplayer race: alice fells the boss, bob gets the escape window", async ({
		browser,
	}) => {
		test.setTimeout(180_000);
		await server.addUserToInstance({
			storeTypeId: "procedural-dungeon",
			instanceId: "pd-shared",
			userId: "alice",
		});
		await server.addUserToInstance({
			storeTypeId: "procedural-dungeon",
			instanceId: "pd-shared",
			userId: "bob",
		});
		const aliceContext = await browser.newContext();
		const bobContext = await browser.newContext();
		const alicePage = await aliceContext.newPage();
		await alicePage.goto(sessionUrl("pd-shared", "alice"));
		const aliceFrame = await waitForBlobFrame(alicePage);
		await waitForScene(aliceFrame);

		// Small deterministic floor shared with the room.
		await aliceFrame.locator("#hudForge").click();
		await aliceFrame.locator("#rooms").evaluate((el) => {
			const input = el as HTMLInputElement;
			input.value = "12";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await expect(aliceFrame.locator("#sRooms")).toHaveText("12", {
			timeout: 10_000,
		});
		await aliceFrame.locator("#seed").fill("4242");
		await aliceFrame.locator("#forge").click();
		await expect(aliceFrame.locator("#dsub")).toContainText("seed 4242");
		await aliceFrame.locator("#hudForge").click();

		// Bob is live in the same dungeon BEFORE the race is decided. (His page
		// sits in the background: store subscriptions keep flowing without rAF.)
		const bobPage = await bobContext.newPage();
		await bobPage.goto(sessionUrl("pd-shared", "bob"));
		const bobFrame = await waitForBlobFrame(bobPage);
		await expect(bobFrame.locator("#dname")).not.toHaveText("—", {
			timeout: 30_000,
		});
		await expect(bobFrame.locator("#dsub")).toContainText("seed 4242", {
			timeout: 15_000,
		});
		// Let bob's run age past the history-sync window so the boss claim
		// counts as live news, not history.
		await bobPage.waitForTimeout(4500);

		// Alice marches to the boss and clears the floor.
		await alicePage.bringToFront();
		const start = await gameState(aliceFrame);
		const boss = start.boss as { x: number; y: number };
		await aliceFrame.evaluate(
			(target) =>
				(
					window as unknown as {
						__dfGame: { moveTo: (x: number, y: number) => boolean };
					}
				).__dfGame.moveTo(target.x, target.y),
			boss,
		);
		await expect
			.poll(async () => (await gameState(aliceFrame)).over, {
				timeout: 40_000,
			})
			.toBe(true);
		const aliceEnd = await gameState(aliceFrame);
		expect(aliceEnd.victory).toBe(true);

		// Bob's client learns the boss fell mid-run: the escape window opens.
		await expect(bobFrame.locator("#escapeBanner")).toBeVisible({
			timeout: 20_000,
		});
		await expect(bobFrame.locator("#escapeBanner")).toContainText(
			"felled the boss",
		);
		// Bob's hero is standing on the entrance ring, so the escape banks as
		// soon as his (heartbeat-throttled) game loop notices — possibly before
		// we foreground him, after which the host may already have resolved the
		// end overlay and hidden the card. Assert the terminal state itself:
		// the run is over and the endcard was filled with the ESCAPED copy.
		await bobPage.bringToFront();
		await expect
			.poll(async () => (await gameState(bobFrame)).over, { timeout: 30_000 })
			.toBe(true);
		await expect(bobFrame.locator("#endTitle")).toHaveText(/ESCAPED/, {
			timeout: 15_000,
		});
		await expect(bobFrame.locator(".df-playerchip")).toContainText("☠", {
			timeout: 15_000,
		});
		// Alice's finished run left a ghost that replays on bob's floor.
		await expect(bobFrame.locator(".df-ghosttag")).toBeAttached({
			timeout: 20_000,
		});
		await expect(bobFrame.locator(".df-ghosttag")).toContainText("👻");

		await aliceContext.close();
		await bobContext.close();
	});
});
