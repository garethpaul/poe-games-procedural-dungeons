export const TILE_SCHEMA_VERSION = 1;

/** Fixed itemKey of the single shared forge-settings row. */
export const FORGE_KEY = "forge";

/** Platform leaderboard: best gold haul from a single floor. */
export const LEADERBOARD_ID = "gold-haul";
/** Bounded window of recent runs kept in the store. */
export const MAX_RECENT_RUNS = 50;
/** Hero max health — shared by the engine, mutators, and hooks. */
export const MAX_HP = 100;
/** Minimum interval between live position mutations while walking. */
export const PRESENCE_THROTTLE_MS = 600;
/** Hard cap on ghost replay traces — bounded, downsampled, never per-frame. */
export const GHOST_TRACE_MAX = 240;
/** Gift heal: what the sender pays and what the recipient gets. */
export const GIFT_COST = 25;
export const GIFT_HP = 20;
/** Mimic curse: cost to trap a chest. */
export const CURSE_COST = 15;

export const THEME_OPTIONS = [
	"auto",
	"ancient",
	"molten",
	"frost",
	"grim",
	"verdant",
] as const;
export type ThemeOption = (typeof THEME_OPTIONS)[number];

export const ROOMS_MIN = 12;
export const ROOMS_MAX = 80;
export const LOOPINESS_MIN = 0;
export const LOOPINESS_MAX = 40;
export const DECOR_MIN = 0;
export const DECOR_MAX = 100;

export interface ForgeSettings {
	seed: number;
	theme: ThemeOption;
	rooms: number;
	loopiness: number;
	decor: number;
}

export const DEFAULT_FORGE_SETTINGS: ForgeSettings = {
	seed: 1337,
	theme: "auto",
	rooms: 42,
	loopiness: 15,
	decor: 60,
};

const clampInt = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, Math.round(value)));

/** Normalize arbitrary numeric input into a valid, forgeable settings object. */
export function clampSettings(input: ForgeSettings): ForgeSettings {
	return {
		seed: input.seed >>> 0,
		theme: THEME_OPTIONS.includes(input.theme)
			? input.theme
			: DEFAULT_FORGE_SETTINGS.theme,
		rooms: clampInt(input.rooms, ROOMS_MIN, ROOMS_MAX),
		loopiness: clampInt(input.loopiness, LOOPINESS_MIN, LOOPINESS_MAX),
		decor: clampInt(input.decor, DECOR_MIN, DECOR_MAX),
	};
}

/** Stable identity for change detection between local and synced settings. */
export function settingsKey(s: ForgeSettings): string {
	return `${s.seed}|${s.theme}|${s.rooms}|${s.loopiness}|${s.decor}`;
}
