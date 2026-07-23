/**
 * Types for the ported Dungeon Forge engine (dungeon-forge.js). The engine is
 * kept as plain JavaScript to stay diffable against the upstream game; this
 * declaration is its typed surface.
 */
import type { ForgeSettings } from "../../synced-store/constants";

export type GameEvent =
	| {
			type: "hud";
			hp: number;
			maxHp: number;
			gold: number;
			over: boolean;
			victory: boolean;
	  }
	| {
			type: "fx";
			kind: "hit" | "gold" | "heal" | "win" | "death" | "closing";
	  }
	| { type: "firstMove" }
	| { type: "runStart"; seed: number }
	| { type: "claim"; key: string }
	| { type: "pos"; cell: { x: number; y: number }; hp: number; gold: number }
	| { type: "profile"; userId: string }
	| { type: "escape"; winner: string; seconds: number }
	| {
			type: "end";
			victory: boolean;
			gold: number;
			name: string;
			seed: number;
			external: boolean;
			winner: string | null;
			escaped: boolean;
	  };

export interface RemotePlayer {
	userId: string;
	name: string;
	cell: { x: number; y: number } | null;
	over: boolean;
}

export interface GhostRun {
	userId: string;
	name: string;
	trace: Array<{ x: number; y: number; t: number }>;
	gold: number;
}

export interface GameState {
	hp: number;
	maxHp: number;
	gold: number;
	over: boolean;
	victory: boolean;
	walking: boolean;
	escaping: boolean;
	cell: { x: number; y: number };
	boss: { x: number; y: number } | null;
	chests: Array<{ x: number; y: number }>;
	seed: number;
	name: string;
}

export interface GameApi {
	state: () => GameState;
	moveTo: (x: number, y: number) => boolean;
	/** Retry the same floor (delta 0) or descend to the next one (delta 1). */
	newRun: (seedDelta: number) => void;
	/** Hide POIs claimed by other members; end the run if they took the boss. */
	applyClaims: (
		claims: Array<{ key: string; name: string }>,
		bossByOtherName?: string | null,
	) => void;
	/** Render/refresh the other members' heroes. */
	setRemotePlayers: (players: RemotePlayer[]) => void;
	/** Render/refresh looping translucent replays of recorded runs. */
	setGhosts: (ghosts: GhostRun[]) => void;
	/** Living players' progress toward the boss, for the race meter. */
	raceProgress: () => Array<{ userId: string; pct: number; color: string }>;
	/** Debit gold spent on interplay actions (gifts, curses). */
	spendGold: (n: number) => void;
	/** Apply a heal another player sent. */
	receiveHeal: (hp: number, fromName: string) => void;
	/** Sync mimic curses; own curses render a curser-only shimmer. */
	setCurses: (
		curses: Array<{ key: string; name: string; mine: boolean }>,
	) => void;
	/** Nearest untrapped, unopened chest to the hero (trap target). */
	curseNearestChest: () => { key: string; x: number; y: number } | null;
	/** Float a short message at the hero (errors, confirmations). */
	say: (text: string, cls?: string) => void;
}

export interface DungeonForgeOptions {
	/** App element containing the control-panel markup (queried by id). */
	root: HTMLElement;
	/** Element the WebGL canvas is appended to; sized by the host iframe. */
	host: HTMLElement;
	/** Forge settings restored from the synced store, if any. */
	initialSettings: ForgeSettings | null;
	/** Fired on every forge with the settings that produced the dungeon. */
	onSettingsChange?: (settings: ForgeSettings) => void;
	/** Fired for HUD updates, feedback effects, and run-terminal events. */
	onGameEvent?: (event: GameEvent) => void;
}

export interface DungeonForgeHandle {
	/** Apply settings that arrived from the synced store; re-forges if changed. */
	applySettings: (settings: ForgeSettings) => void;
	getSettings: () => ForgeSettings;
	destroy: () => void;
	canvas: HTMLCanvasElement;
	game: GameApi;
}

export function initDungeonForge(
	options: DungeonForgeOptions,
): DungeonForgeHandle;
