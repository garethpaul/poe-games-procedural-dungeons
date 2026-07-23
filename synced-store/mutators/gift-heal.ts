import type { Gift } from "../schema";
import type { AppMutator } from "./types";

// One player sends another a heal. Keyed by gift id so offline replays don't
// double-heal; the recipient's client applies the HP when the row syncs in.
export const giftHeal: AppMutator<"giftHeal"> = async (ctx, input) => {
	if (await ctx.table("gifts").has(input.id)) return;
	const gift: Gift = {
		id: input.id,
		from: input.from,
		to: input.to,
		hp: input.hp,
		at: input.at,
	};
	await ctx.table("gifts").set({ itemKey: input.id, value: gift });
};
