import type { InferMutatorHandlers } from "poe-tiles-sdk/v1/client.js";
import type { AppSchema } from "../schema";

export type AppMutators = InferMutatorHandlers<AppSchema>;
export type AppMutator<Name extends keyof AppMutators> = AppMutators[Name];
