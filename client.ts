import type { InferSyncedStoreClient } from "poe-tiles-sdk/v1/client.js";
import type { AppSchema } from "./synced-store/schema";

export type { AppSchema, tileSchema } from "./synced-store/schema";
export type AppStoreClient = InferSyncedStoreClient<AppSchema>;
export type { AppReadCtx, AppTableTypes } from "./synced-store/data/index";
export {
	tileMutators,
} from "./synced-store/mutators/index";
export { tileClientConfig } from "./synced-store/client-config";
