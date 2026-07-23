import { expect, test } from "bun:test";
import { getLeaderboard } from "poe-tiles-sdk/v1/client.js";
import {
	createPoeTileTestHarness,
	waitForKeyMatch,
} from "poe-tiles-sdk/v1/test-utils.js";
import { tileBackendConfig } from "./backend-config";
import {
	DECOR_MAX,
	FORGE_KEY,
	LEADERBOARD_ID,
	LOOPINESS_MAX,
	ROOMS_MAX,
	ROOMS_MIN,
} from "./constants";
import type { AppSchema, ForgeSettingsRow, Run } from "./schema";

function createHarness() {
	return createPoeTileTestHarness<AppSchema>({
		store: { backendConfig: tileBackendConfig },
	});
}

test("setForgeSettings persists the shared forge row", async () => {
	const harness = createHarness();
	const { store } = await harness.createClient({ userId: "alice" });

	await store.mutate.setForgeSettings({
		seed: 424242,
		theme: "molten",
		rooms: 60,
		loopiness: 25,
		decor: 80,
		updatedAt: 1000,
		updatedBy: "alice",
	});

	const row = (await store.query((tx) =>
		tx.table("forge").get(FORGE_KEY),
	)) as ForgeSettingsRow;
	expect(row).toMatchObject({
		seed: 424242,
		theme: "molten",
		rooms: 60,
		loopiness: 25,
		decor: 80,
		updatedBy: "alice",
	});
});

test("setForgeSettings clamps out-of-range values instead of rejecting them", async () => {
	const harness = createHarness();
	const { store } = await harness.createClient({ userId: "alice" });

	await store.mutate.setForgeSettings({
		seed: 7,
		theme: "frost",
		rooms: 9999,
		loopiness: -3,
		decor: 250,
		updatedAt: 1000,
		updatedBy: "alice",
	});

	const row = (await store.query((tx) =>
		tx.table("forge").get(FORGE_KEY),
	)) as ForgeSettingsRow;
	expect(row.rooms).toBe(ROOMS_MAX);
	expect(row.loopiness).toBe(0);
	expect(row.decor).toBe(DECOR_MAX);

	await store.mutate.setForgeSettings({
		seed: 7,
		theme: "frost",
		rooms: 1,
		loopiness: 999,
		decor: 0,
		updatedAt: 2000,
		updatedBy: "alice",
	});
	const row2 = (await store.query((tx) =>
		tx.table("forge").get(FORGE_KEY),
	)) as ForgeSettingsRow;
	expect(row2.rooms).toBe(ROOMS_MIN);
	expect(row2.loopiness).toBe(LOOPINESS_MAX);
});

test("last write wins — a second member reforges the shared dungeon", async () => {
	const harness = createHarness();
	const alice = await harness.createClient({ userId: "alice" });
	const bob = await harness.createClient({ userId: "bob" });

	await alice.store.mutate.setForgeSettings({
		seed: 1,
		theme: "ancient",
		rooms: 30,
		loopiness: 10,
		decor: 50,
		updatedAt: 1000,
		updatedBy: "alice",
	});
	// Gate on alice's write reaching bob before bob reforges, so "last" is
	// deterministic (sequential mutations from different clients otherwise
	// race each other's optimistic state).
	await waitForKeyMatch<ForgeSettingsRow>(bob.store, {
		table: "forge",
		key: FORGE_KEY,
		match: (row) => row.seed === 1,
	});
	await bob.store.mutate.setForgeSettings({
		seed: 2,
		theme: "grim",
		rooms: 44,
		loopiness: 12,
		decor: 55,
		updatedAt: 2000,
		updatedBy: "bob",
	});
	await waitForKeyMatch<ForgeSettingsRow>(alice.store, {
		table: "forge",
		key: FORGE_KEY,
		match: (row) => row.seed === 2,
	});
	const row = (await alice.store.query((tx) =>
		tx.table("forge").get(FORGE_KEY),
	)) as ForgeSettingsRow;
	expect(row.seed).toBe(2);
	expect(row.theme).toBe("grim");
	expect(row.updatedBy).toBe("bob");
});

test("recordRun stores the run and keeps the best haul on the leaderboard", async () => {
	const harness = createHarness();
	const { store } = await harness.createClient({ userId: "alice" });

	await store.mutate.recordRun({
		userId: "alice",
		runId: "run-1",
		gold: 80,
		victory: false,
		seed: 7,
		floorName: "The Test Depths",
		createdAt: 100,
	});
	await store.mutate.recordRun({
		userId: "alice",
		runId: "run-2",
		gold: 210,
		victory: true,
		seed: 8,
		floorName: "The Test Depths",
		createdAt: 200,
	});
	// A worse later run must NOT lower the leaderboard best.
	await store.mutate.recordRun({
		userId: "alice",
		runId: "run-3",
		gold: 40,
		victory: false,
		seed: 9,
		floorName: "The Test Depths",
		createdAt: 300,
	});

	const runs = (await store.query((tx) =>
		tx.table("runs").scan().values().toArray(),
	)) as Run[];
	expect(runs.length).toBe(3);

	const board = await store.query((tx) =>
		getLeaderboard(tx, { leaderboardId: LEADERBOARD_ID }),
	);
	expect(board.entries.length).toBe(1);
	expect(board.entries[0]).toMatchObject({ userId: "alice", score: 210 });
});

test("recordRun replay of the same runId is idempotent", async () => {
	const harness = createHarness();
	const { store } = await harness.createClient({ userId: "alice" });

	const input = {
		userId: "alice",
		runId: "run-x",
		gold: 55,
		victory: true,
		seed: 3,
		floorName: "The Test Depths",
		createdAt: 100,
	};
	await store.mutate.recordRun(input);
	await store.mutate.recordRun(input);

	const runs = (await store.query((tx) =>
		tx.table("runs").scan().values().toArray(),
	)) as Run[];
	expect(runs.length).toBe(1);
});

test("onAddUsers seeds a player row; claimPoi is first-claim-wins", async () => {
	const harness = createHarness();
	const alice = await harness.createClient({ userId: "alice" });
	const bob = await harness.createClient({ userId: "bob" });

	const me = await alice.store.query((tx) => tx.table("players").get("alice"));
	expect(me).toMatchObject({ userId: "alice", hp: 100, gold: 0, over: false });

	await alice.store.mutate.claimPoi({ userId: "alice", key: "chest-2", at: 10 });
	await waitForKeyMatch(bob.store, {
		table: "claims",
		key: "chest-2",
		match: (c: { userId: string }) => c.userId === "alice",
	});
	// Bob's later claim on the same chest is dropped.
	await bob.store.mutate.claimPoi({ userId: "bob", key: "chest-2", at: 20 });
	await bob.store.waitForServerData();
	const claim = await bob.store.query((tx) => tx.table("claims").get("chest-2"));
	expect(claim).toMatchObject({ userId: "alice" });
});

test("updatePlayer publishes live state; reforge resets players and claims", async () => {
	const harness = createHarness();
	const { store } = await harness.createClient({ userId: "alice" });

	await store.mutate.updatePlayer({
		userId: "alice",
		cell: { x: 4, y: 7 },
		hp: 62,
		gold: 45,
		over: false,
		victory: false,
		updatedAt: 100,
	});
	await store.mutate.claimPoi({ userId: "alice", key: "boss", at: 100 });

	// Reforging the floor wipes claims and resets every player's run.
	await store.mutate.setForgeSettings({
		seed: 9,
		theme: "grim",
		rooms: 20,
		loopiness: 10,
		decor: 50,
		updatedAt: 200,
		updatedBy: "alice",
	});

	const player = await store.query((tx) => tx.table("players").get("alice"));
	expect(player).toMatchObject({ hp: 100, gold: 0, over: false, cell: null });
	const claims = await store.query((tx) =>
		tx.table("claims").scan().values().toArray(),
	);
	expect(claims.length).toBe(0);
});

test("saveGhost keeps the best-gold run per floor and stays bounded", async () => {
	const harness = createHarness();
	const { store } = await harness.createClient({ userId: "alice" });

	const trace = [
		{ x: 1, y: 1, t: 0 },
		{ x: 2, y: 1, t: 0.4 },
		{ x: 3, y: 1, t: 0.8 },
	];
	await store.mutate.saveGhost({
		userId: "alice",
		floorKey: "floor-a",
		gold: 120,
		victory: true,
		trace,
		recordedAt: 100,
	});
	// Worse run on the same floor must not replace the ghost.
	await store.mutate.saveGhost({
		userId: "alice",
		floorKey: "floor-a",
		gold: 40,
		victory: false,
		trace,
		recordedAt: 200,
	});
	let ghost = await store.query((tx) => tx.table("ghosts").get("alice"));
	expect(ghost).toMatchObject({ gold: 120, floorKey: "floor-a" });

	// A run on a different floor always replaces (old trace can't replay).
	await store.mutate.saveGhost({
		userId: "alice",
		floorKey: "floor-b",
		gold: 10,
		victory: false,
		trace,
		recordedAt: 300,
	});
	ghost = await store.query((tx) => tx.table("ghosts").get("alice"));
	expect(ghost).toMatchObject({ gold: 10, floorKey: "floor-b" });
});

test("recordRun dethronement path runs clean for both takeover and non-takeover", async () => {
	const harness = createHarness();
	const alice = await harness.createClient({ userId: "alice" });
	const bob = await harness.createClient({ userId: "bob" });

	// Alice sets the bar.
	await alice.store.mutate.recordRun({
		userId: "alice",
		runId: "a-1",
		gold: 100,
		victory: true,
		seed: 1,
		floorName: "The Test Depths",
		createdAt: 100,
	});
	await bob.store.waitForServerData();
	// Bob dethrones alice (targeted notification path).
	await bob.store.mutate.recordRun({
		userId: "bob",
		runId: "b-1",
		gold: 150,
		victory: false,
		seed: 1,
		floorName: "The Test Depths",
		createdAt: 200,
	});
	// Bob adds a lower score (no dethronement path).
	await bob.store.mutate.recordRun({
		userId: "bob",
		runId: "b-2",
		gold: 10,
		victory: false,
		seed: 2,
		floorName: "The Test Depths",
		createdAt: 300,
	});

	// Poll until both entries have propagated to bob's client.
	let sorted: Array<{ userId: string; score: number }> = [];
	for (let i = 0; i < 50 && sorted.length < 2; i++) {
		await bob.store.waitForServerData();
		const board = await bob.store.query((tx) =>
			getLeaderboard(tx, { leaderboardId: LEADERBOARD_ID }),
		);
		sorted = [...board.entries].sort((a, b) => b.score - a.score);
		if (sorted.length < 2)
			await new Promise((resolve) => setTimeout(resolve, 50));
	}
	expect(sorted[0]).toMatchObject({ userId: "bob", score: 150 });
	expect(sorted[1]).toMatchObject({ userId: "alice", score: 100 });
});
