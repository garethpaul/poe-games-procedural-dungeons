import type { InferMutationContext } from "poe-tiles-sdk/v1/client.js";
import { MAX_HP } from "./constants";
import type { AppSchema, Player } from "./schema";

type AppMutationCtx = InferMutationContext<AppSchema>;

/** Seed a fresh player row for a newly added room member (idempotent). */
export async function seedPlayer(
	ctx: AppMutationCtx,
	userId: string,
	at: number,
): Promise<void> {
	const existing = await ctx.table("players").get(userId);
	if (existing) return;
	const row: Player = {
		userId,
		cell: null,
		hp: MAX_HP,
		gold: 0,
		over: false,
		victory: false,
		updatedAt: at,
	};
	await ctx.table("players").set({ itemKey: userId, value: row });
}

// Declared identically in backend-config and client-config so fresh prepared
// instances seat members optimistically before server data arrives. Browser-
// safe: deterministic app-table writes only.
export const tileHooks = {
	onAddUsers: async (ctx: unknown, { userId }: { userId: string }) => {
		await seedPlayer(ctx as AppMutationCtx, userId, 0);
	},
};
