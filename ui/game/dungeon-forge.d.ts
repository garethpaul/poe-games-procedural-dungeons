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
	| { type: "fx"; kind: "hit" | "gold" | "heal" | "win" | "death" }
	| { type: "firstMove" }
	| { type: "runStart"; seed: number }
	| { type: "claim"; key: string }
	| { type: "pos"; cell: { x: number; y: number }; hp: number; gold: number }
	| { type: "profile"; userId: string }
	| {
			type: "end";
			victory: boolean;
			gold: number;
			name: string;
			seed: number;
			external: boolean;
			winner: string | null;
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
	applyClaims: (keys: string[], bossByOtherName?: string | null) => void;
	/** Render/refresh the other members' heroes. */
	setRemotePlayers: (players: RemotePlayer[]) => void;
	/** Render/refresh looping translucent replays of recorded runs. */
	setGhosts: (ghosts: GhostRun[]) => void;
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
