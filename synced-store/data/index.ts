import type {
	InferReadContext,
	InferSchemaTableTypes,
} from "poe-tiles-sdk/v1/client.js";
import { FORGE_KEY } from "../constants";
import type { AppSchema, ForgeSettingsRow } from "../schema";

export type AppTableTypes = InferSchemaTableTypes<AppSchema>;
export type AppReadCtx = InferReadContext<AppSchema>;

/** Read the shared forge-settings row, if one has been written yet. */
export async function readForgeSettings(
	ctx: AppReadCtx,
): Promise<ForgeSettingsRow | undefined> {
	return (await ctx.table("forge").get(FORGE_KEY)) as
		| ForgeSettingsRow
		| undefined;
}
