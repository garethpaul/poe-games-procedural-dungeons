import type { Claim } from "../schema";
import type { AppMutator } from "./types";

// First-claim-wins: once a POI has an owner, later claims are silently
// dropped. Two players grabbing the same chest in the same instant both see
// it open locally, but only the first server-serialized claim banks it — an
// acceptable, self-healing divergence for a casual race.
export const claimPoi: AppMutator<"claimPoi"> = async (ctx, input) => {
	const existing = await ctx.table("claims").get(input.key);
	if (existing) return;
	const claim: Claim = {
		key: input.key,
		userId: input.userId,
		at: input.at,
	};
	await ctx.table("claims").set({ itemKey: input.key, value: claim });
};
