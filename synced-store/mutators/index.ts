import { claimPoi } from "./claim-poi";
import { recordRun } from "./record-run";
import { saveGhost } from "./save-ghost";
import { setForgeSettings } from "./set-forge-settings";
import { updatePlayer } from "./update-player";
import type { AppMutators } from "./types";

export const tileMutators: AppMutators = {
	setForgeSettings,
	recordRun,
	updatePlayer,
	claimPoi,
	saveGhost,
};

export type { AppMutator, AppMutators } from "./types";
