import { defineBackendConfig } from "poe-tiles-sdk/v1/backend.js";
import { tileSchema } from "./schema";
import { tileMutators } from "./mutators/index";
import { tileHooks } from "./hooks";

export const tileBackendConfig = defineBackendConfig({
	schema: tileSchema,
	mutators: tileMutators,
	hooks: tileHooks,
	actions: {},
});
