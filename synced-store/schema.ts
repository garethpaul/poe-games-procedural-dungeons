import { z } from "zod";
import { defineSchema, table } from "poe-tiles-sdk/v1/backend.js";
import {
	GHOST_TRACE_MAX,
	TILE_SCHEMA_VERSION,
	THEME_OPTIONS,
} from "./constants";

// The one shared forge-settings row (fixed itemKey "forge"). Everyone in the
// context sees — and can reforge — the same dungeon: the generator is fully
// deterministic, so syncing these five inputs syncs the whole world.
export const forgeSettingsSchema = z.object({
	seed: z.number().int().nonnegative(),
	theme: z.enum(THEME_OPTIONS),
	rooms: z.number(),
	loopiness: z.number(),
	decor: z.number(),
	updatedAt: z.number(),
	updatedBy: z.string(),
});
export type ForgeSettingsRow = z.infer<typeof forgeSettingsSchema>;

// One completed dungeon run (victory or death). Keyed by runId; bounded to the
// most recent MAX_RECENT_RUNS rows. Public so the room can see recent hauls.
export const runSchema = z.object({
	id: z.string(),
	userId: z.string(),
	gold: z.number().int().nonnegative(),
	victory: z.boolean(),
	seed: z.number().int().nonnegative(),
	createdAt: z.number(),
});
export type Run = z.infer<typeof runSchema>;

// Live player presence on the current floor. Keyed by userId; seeded by
// onAddUsers and reset whenever the floor reforges. `cell` is null until the
// player's client spawns their hero.
export const playerSchema = z.object({
	userId: z.string(),
	cell: z.object({ x: z.number(), y: z.number() }).nullable(),
	hp: z.number(),
	gold: z.number().int().nonnegative(),
	over: z.boolean(),
	victory: z.boolean(),
	updatedAt: z.number(),
});
export type Player = z.infer<typeof playerSchema>;

// Ghost replay of a player's best run on one floor. Keyed by userId (one
// ghost per player); `floorKey` ties the trace to the exact floor settings so
// a ghost never replays through the walls of a different layout. The trace is
// a bounded, downsampled list of grid cells with elapsed seconds.
export const ghostSchema = z.object({
	userId: z.string(),
	floorKey: z.string(),
	gold: z.number().int().nonnegative(),
	victory: z.boolean(),
	trace: z
		.array(z.object({ x: z.number(), y: z.number(), t: z.number() }))
		.max(GHOST_TRACE_MAX),
	recordedAt: z.number(),
});
export type Ghost = z.infer<typeof ghostSchema>;

// A heal one player sent another. Keyed by gift id; cleared on reforge.
export const giftSchema = z.object({
	id: z.string(),
	from: z.string(),
	to: z.string(),
	hp: z.number().int().positive(),
	at: z.number(),
});
export type Gift = z.infer<typeof giftSchema>;

// A mimic trap armed on an unopened chest. Keyed by the chest's claim key
// ("chest-<i>"); first curse wins; cleared on reforge. Only the curser sees
// the shimmer — for everyone else the chest looks ordinary. That's the bluff.
export const curseSchema = z.object({
	key: z.string(),
	by: z.string(),
	at: z.number(),
});
export type Curse = z.infer<typeof curseSchema>;

// First-claim-wins ownership of a point of interest on the current floor.
// Keyed by the POI key ("spawn-3", "chest-1", "shrine-0", "boss"); cleared
// whenever the floor reforges.
export const claimSchema = z.object({
	key: z.string(),
	userId: z.string(),
	at: z.number(),
});
export type Claim = z.infer<typeof claimSchema>;

export const tileSchema = defineSchema({
	schemaVersion: TILE_SCHEMA_VERSION,
	tables: {
		forge: { schema: table(forgeSettingsSchema) },
		runs: { schema: table(runSchema) },
		players: { schema: table(playerSchema) },
		claims: { schema: table(claimSchema) },
		ghosts: { schema: table(ghostSchema) },
		gifts: { schema: table(giftSchema) },
		curses: { schema: table(curseSchema) },
	},
	mutators: {
		setForgeSettings: {
			description:
				"Reforge the shared floor: update settings (clamped), clear all claims, and reset every player's run state",
			input: forgeSettingsSchema,
		},
		recordRun: {
			description:
				"Record a finished dungeon run, persist the player's best gold haul on the leaderboard, and send the high-signal social notifications (dethronement push, victory chat milestone)",
			input: z.object({
				userId: z.string(),
				runId: z.string(),
				gold: z.number().int().nonnegative(),
				victory: z.boolean(),
				seed: z.number().int().nonnegative(),
				floorName: z.string().max(120),
				createdAt: z.number(),
			}),
		},
		updatePlayer: {
			description:
				"Publish the player's live run state (position, hp, gold) to the room",
			input: playerSchema,
		},
		claimPoi: {
			description:
				"Claim a point of interest (enemy, chest, shrine, boss) — first claim wins, later claims are ignored",
			input: z.object({
				userId: z.string(),
				key: z.string(),
				at: z.number(),
			}),
		},
		saveGhost: {
			description:
				"Save the player's run trace as a replayable ghost — keeps their best-gold run per floor",
			input: ghostSchema,
		},
		giftHeal: {
			description:
				"Send another player a heal (idempotent per gift id); the recipient's client applies the HP",
			input: giftSchema,
		},
		curseChest: {
			description:
				"Arm a mimic trap on an unopened chest — first curse wins; rejected if the chest is already claimed",
			input: curseSchema,
		},
	},
});

export type AppSchema = typeof tileSchema;
