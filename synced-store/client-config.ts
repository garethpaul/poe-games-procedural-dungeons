import { defineClientConfig } from "poe-tiles-sdk/v1/client.js";
import type { tileSchema } from "./schema";
import { tileMutators } from "./mutators/index";
import { tileHooks } from "./hooks";
import { TILE_SCHEMA_VERSION } from "./constants";

export const tileClientConfig = defineClientConfig<typeof tileSchema>({
	mutators: tileMutators,
	hooks: tileHooks,
	schemaVersion: TILE_SCHEMA_VERSION,
});
