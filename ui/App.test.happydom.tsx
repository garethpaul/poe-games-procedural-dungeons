import { expect, test } from "bun:test";
import { createPoeTileTestHarness } from "poe-tiles-sdk/v1/test-utils.js";
import "../tests/setup-dom";
import { tileBackendConfig } from "../synced-store/backend-config";
import { DEFAULT_FORGE_SETTINGS, FORGE_KEY } from "../synced-store/constants";
import type { AppSchema, ForgeSettingsRow } from "../synced-store/schema";
import type {
	DungeonForgeHandle,
	DungeonForgeOptions,
} from "./game/dungeon-forge";
import { mountApp } from "./App";

async function settle(macroticks = 6): Promise<void> {
	for (let i = 0; i < macroticks; i += 1) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		await Promise.resolve();
	}
}

async function createStore() {
	const harness = createPoeTileTestHarness<AppSchema>({
		store: { backendConfig: tileBackendConfig },
	});
	const { store } = await harness.createClient({ userId: "alice" });
	return store;
}

interface StubEngine {
	handle: DungeonForgeHandle;
	options: DungeonForgeOptions;
	applied: DungeonForgeOptions["initialSettings"][];
	destroyed: number;
	newRuns: number[];
}

function stubEngineFactory(): {
	createEngine: (options: DungeonForgeOptions) => DungeonForgeHandle;
	last: () => StubEngine | undefined;
} {
	let last: StubEngine | undefined;
	const createEngine = (options: DungeonForgeOptions): DungeonForgeHandle => {
		const entry: StubEngine = {
			options,
			applied: [],
			destroyed: 0,
			newRuns: [],
			handle: {
				canvas: document.createElement("canvas"),
				getSettings: () => options.initialSettings ?? DEFAULT_FORGE_SETTINGS,
				applySettings: (settings) => {
					entry.applied.push(settings);
				},
				destroy: () => {
					entry.destroyed += 1;
				},
				game: {
					// `over: true` — the end-flow guard checks the run is still the
					// one that ended before acting on the tileEnd outcome.
					state: () => ({
						hp: 100,
						maxHp: 100,
						gold: 0,
						over: true,
						victory: false,
						walking: false,
						cell: { x: 0, y: 0 },
						boss: null,
						chests: [],
						seed: 1337,
						name: "Stub Depths",
					}),
					moveTo: () => true,
					newRun: (delta) => {
						entry.newRuns.push(delta);
					},
					applyClaims: () => {},
					setRemotePlayers: () => {},
					setGhosts: () => {},
				},
			},
		};
		// A real engine forges immediately on init and reports the settings up.
		options.onSettingsChange?.(
			options.initialSettings ?? DEFAULT_FORGE_SETTINGS,
		);
		last = entry;
		return entry.handle;
	};
	return { createEngine, last: () => last };
}

test("mounts the control panel after bootstrap, with defaults", async () => {
	const store = await createStore();
	const root = document.createElement("div");
	document.body.appendChild(root);
	const factory = stubEngineFactory();

	const cleanup = await mountApp(root, store, {
		createEngine: factory.createEngine,
		getCurrentUserId: () => Promise.resolve("alice"),
		now: () => 1234,
	});
	await settle();

	expect(root.querySelector("#panel")).toBeTruthy();
	expect(root.querySelector("#dungeon-host")).toBeTruthy();
	expect(root.querySelector(".df-loading")).toBeNull();
	const stub = factory.last();
	expect(stub).toBeTruthy();
	expect(stub?.options.initialSettings).toEqual(DEFAULT_FORGE_SETTINGS);

	cleanup();
	document.body.removeChild(root);
});

test("first forge on a fresh instance persists the default settings row", async () => {
	const store = await createStore();
	const root = document.createElement("div");
	document.body.appendChild(root);
	const factory = stubEngineFactory();

	const cleanup = await mountApp(root, store, {
		createEngine: factory.createEngine,
		getCurrentUserId: () => Promise.resolve("alice"),
		now: () => 1234,
	});
	// The mutate is debounced; wait it out with real timers.
	await new Promise((resolve) => setTimeout(resolve, 500));
	await settle();

	const row = (await store.query((tx) =>
		tx.table("forge").get(FORGE_KEY),
	)) as ForgeSettingsRow | undefined;
	expect(row).toMatchObject({ ...DEFAULT_FORGE_SETTINGS, updatedBy: "alice" });

	cleanup();
	document.body.removeChild(root);
});

test("restores saved settings and applies remote changes to the engine", async () => {
	const store = await createStore();
	await store.mutate.setForgeSettings({
		seed: 99,
		theme: "verdant",
		rooms: 20,
		loopiness: 5,
		decor: 40,
		updatedAt: 1,
		updatedBy: "bob",
	});

	const root = document.createElement("div");
	document.body.appendChild(root);
	const factory = stubEngineFactory();
	const cleanup = await mountApp(root, store, {
		createEngine: factory.createEngine,
		getCurrentUserId: () => Promise.resolve("alice"),
		now: () => 1234,
	});
	await settle();

	const stub = factory.last();
	expect(stub?.options.initialSettings).toMatchObject({
		seed: 99,
		theme: "verdant",
		rooms: 20,
	});

	// A remote member reforges: the engine must receive the new settings.
	await store.mutate.setForgeSettings({
		seed: 777,
		theme: "molten",
		rooms: 33,
		loopiness: 8,
		decor: 70,
		updatedAt: 2,
		updatedBy: "bob",
	});
	await settle(10);
	expect(stub?.applied.at(-1)).toMatchObject({ seed: 777, theme: "molten" });

	cleanup();
	document.body.removeChild(root);
});

test("run end shows the banner, records the run, then hands off to tileEnd", async () => {
	const store = await createStore();
	const root = document.createElement("div");
	document.body.appendChild(root);
	const factory = stubEngineFactory();
	let tileEndCalls = 0;

	const cleanup = await mountApp(root, store, {
		createEngine: factory.createEngine,
		getCurrentUserId: () => Promise.resolve("alice"),
		now: () => 42,
		endBeatMs: 10,
		poe: {
			tileEnd: () => {
				tileEndCalls += 1;
				return Promise.resolve({ playAgain: true });
			},
		},
	});
	await settle();
	const stub = factory.last();

	stub?.options.onGameEvent?.({
		type: "end",
		victory: true,
		gold: 120,
		name: "The Stub Depths",
		seed: 1337,
		external: false,
		winner: null,
	});
	await settle(2);
	// Decisive banner is visible before the host overlay.
	const endcard = root.querySelector<HTMLElement>("#endcard");
	expect(endcard?.hidden).toBe(false);
	expect(endcard?.textContent).toContain("FLOOR CLEARED");
	expect(endcard?.textContent).toContain("120 gold");

	// After the beat: tileEnd fired and playAgain descended to the next floor.
	await new Promise((resolve) => setTimeout(resolve, 60));
	await settle();
	expect(tileEndCalls).toBe(1);
	expect(stub?.newRuns).toEqual([1]);
	expect(endcard?.hidden).toBe(true);

	// The run was persisted (leaderboard write happens inside the mutator).
	const runs = await store.query((tx) =>
		tx.table("runs").scan().values().toArray(),
	);
	expect(runs.length).toBe(1);
	expect(runs[0]).toMatchObject({ gold: 120, victory: true, userId: "alice" });

	cleanup();
	document.body.removeChild(root);
});

test("shows a visible error when the renderer cannot start", async () => {
	const store = await createStore();
	const root = document.createElement("div");
	document.body.appendChild(root);

	const cleanup = await mountApp(root, store, {
		createEngine: () => {
			throw new Error("no webgl");
		},
		getCurrentUserId: () => Promise.resolve("alice"),
	});
	await settle();

	expect(root.querySelector(".df-error")).toBeTruthy();

	cleanup();
	document.body.removeChild(root);
});
