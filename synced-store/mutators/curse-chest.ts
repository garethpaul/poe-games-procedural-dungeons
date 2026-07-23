import type { Curse } from "../schema";
import type { AppMutator } from "./types";

// Arm a mimic on an unopened chest. First curse wins, and a chest that has
// already been claimed can't be trapped after the fact.
export const curseChest: AppMutator<"curseChest"> = async (ctx, input) => {
	if (await ctx.table("curses").get(input.key)) return;
	if (await ctx.table("claims").get(input.key)) return;
	const curse: Curse = {
		key: input.key,
		by: input.by,
		at: input.at,
	};
	await ctx.table("curses").set({ itemKey: input.key, value: curse });
};
