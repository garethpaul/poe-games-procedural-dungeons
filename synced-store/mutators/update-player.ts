import type { Player } from "../schema";
import type { AppMutator } from "./types";

// Live presence write, throttled client-side while walking. Last write wins —
// each player only writes their own row.
export const updatePlayer: AppMutator<"updatePlayer"> = async (ctx, input) => {
	const row: Player = {
		userId: input.userId,
		cell: input.cell,
		hp: input.hp,
		gold: input.gold,
		over: input.over,
		victory: input.victory,
		updatedAt: input.updatedAt,
	};
	await ctx.table("players").set({ itemKey: input.userId, value: row });
};
