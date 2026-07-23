import { claimPoi } from "./claim-poi";
import { curseChest } from "./curse-chest";
import { giftHeal } from "./gift-heal";
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
	giftHeal,
	curseChest,
};

export type { AppMutator, AppMutators } from "./types";
