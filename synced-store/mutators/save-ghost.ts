import type { Ghost } from "../schema";
import type { AppMutator } from "./types";

// One ghost per player: keep their best-gold run for the floor they're on.
// A run on a different floor always replaces (the old trace can't replay on
// the new layout anyway).
export const saveGhost: AppMutator<"saveGhost"> = async (ctx, input) => {
	const existing = (await ctx.table("ghosts").get(input.userId)) as
		| Ghost
		| undefined;
	if (
		existing &&
		existing.floorKey === input.floorKey &&
		existing.gold >= input.gold
	)
		return;
	const ghost: Ghost = {
		userId: input.userId,
		floorKey: input.floorKey,
		gold: input.gold,
		victory: input.victory,
		trace: input.trace,
		recordedAt: input.recordedAt,
	};
	await ctx.table("ghosts").set({ itemKey: input.userId, value: ghost });
};
