import { setLeaderboardScore } from "poe-tiles-sdk/v1/client.js";
import { LEADERBOARD_ID, MAX_RECENT_RUNS } from "../constants";
import type { Run } from "../schema";
import type { AppMutator } from "./types";

// Records a finished run (victory or death — gold counts either way) and
// persists the player's best haul on the platform leaderboard. Idempotent
// against replay of the same runId: the row is keyed by runId and the
// leaderboard write merges, keeping each user's highest score.
export const recordRun: AppMutator<"recordRun"> = async (ctx, input) => {
	const run: Run = {
		id: input.runId,
		userId: input.userId,
		gold: input.gold,
		victory: input.victory,
		seed: input.seed,
		createdAt: input.createdAt,
	};
	await ctx.table("runs").set({ itemKey: input.runId, value: run });

	// Trim to a bounded window (oldest first); itemKey equals run.id.
	const runs = (await ctx.table("runs").scan().values().toArray()) as Run[];
	if (runs.length > MAX_RECENT_RUNS) {
		const oldest = [...runs]
			.sort((a, b) => a.createdAt - b.createdAt)
			.slice(0, runs.length - MAX_RECENT_RUNS);
		for (const entry of oldest) await ctx.table("runs").delete(entry.id);
	}

	await setLeaderboardScore(
		ctx,
		{
			leaderboardId: LEADERBOARD_ID,
			userId: input.userId,
			score: input.gold,
			bestScore: "highest",
			label: "Best haul",
			displayScore: `${input.gold}g`,
		},
		{ mode: "merge" },
	);
};
