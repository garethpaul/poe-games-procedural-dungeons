import { clampSettings, FORGE_KEY, MAX_HP } from "../constants";
import type { Claim, ForgeSettingsRow, Player } from "../schema";
import type { AppMutator } from "./types";

// Writes the shared forge settings. Values are clamped rather than rejected so
// a stale client (or a hand-edited seed) can never wedge the row in a state
// the generator can't handle. Last write wins — the dungeon is a shared toy,
// not a turn-based resource.
//
// Reforging also starts a fresh floor for everyone: all POI claims are
// cleared and every player's run state resets to a full-health spawn.
export const setForgeSettings: AppMutator<"setForgeSettings"> = async (
	ctx,
	input,
) => {
	const clamped = clampSettings(input);
	const row: ForgeSettingsRow = {
		...clamped,
		updatedAt: input.updatedAt,
		updatedBy: input.updatedBy,
	};
	await ctx.table("forge").set({ itemKey: FORGE_KEY, value: row });

	const claims = (await ctx
		.table("claims")
		.scan()
		.values()
		.toArray()) as Claim[];
	for (const claim of claims) await ctx.table("claims").delete(claim.key);

	const players = (await ctx
		.table("players")
		.scan()
		.values()
		.toArray()) as Player[];
	for (const player of players) {
		await ctx.table("players").set({
			itemKey: player.userId,
			value: {
				userId: player.userId,
				cell: null,
				hp: MAX_HP,
				gold: 0,
				over: false,
				victory: false,
				updatedAt: input.updatedAt,
			},
		});
	}
};
