import {
	getLeaderboard,
	notifyActivity,
	setLeaderboardScore,
} from "poe-tiles-sdk/v1/client.js";
import { LEADERBOARD_ID, MAX_RECENT_RUNS } from "../constants";
import type { Run } from "../schema";
import type { AppMutator } from "./types";

// Records a finished run (victory or death — gold counts either way) and
// persists the player's best haul on the platform leaderboard. Idempotent
// against replay of the same runId: the row is keyed by runId and the
// leaderboard write merges, keeping each user's highest score.
//
// Also the home of the game's two high-signal social notifications:
// a targeted "X beat your best haul" push to a dethroned leader, and a
// victory milestone appended to the containing chat (skips gracefully when
// there is no chat room). Deliberately nothing lower-signal — no per-death
// or per-turn spam.
export const recordRun: AppMutator<"recordRun"> = async (ctx, input) => {
	const alreadyRecorded = await ctx.table("runs").has(input.runId);
	const board = await getLeaderboard(ctx, { leaderboardId: LEADERBOARD_ID });
	const prevTop = board.entries.length
		? [...board.entries].sort((a, b) => b.score - a.score)[0]
		: null;

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

	// Replays of the same runId must not re-notify.
	if (alreadyRecorded) return;

	const info = (await ctx.table("$userInfo").get(input.userId)) as
		| { displayName?: string }
		| undefined;
	const scorer = info?.displayName ?? "Someone";

	// Dethronement: the previous leader just lost the top spot to this run.
	if (
		prevTop &&
		prevTop.userId !== input.userId &&
		input.gold > prevTop.score
	) {
		await notifyActivity(ctx, {
			targetUserIds: [prevTop.userId],
			unread: "increment",
			preview: `${scorer} beat your best haul — ${input.gold}g`,
			previewTimestamp: input.createdAt,
			push: {
				body: `${scorer} beat your best haul — ${input.gold}g on ${input.floorName}`,
			},
		});
	}

	// Victory milestone: one announcement in the containing chat, no badges.
	if (input.victory) {
		const text = `⚔ ${scorer} felled the boss of ${input.floorName} — ${input.gold}g banked`;
		await notifyActivity(ctx, {
			preview: text,
			previewTimestamp: input.createdAt,
			postToChat: {
				messageId: input.runId,
				text,
				timestamp: input.createdAt,
			},
		});
	}
};
