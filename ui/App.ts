import { getLeaderboard } from "poe-tiles-sdk/v1/client.js";
import loadingArtUrl from "./art/loading.jpg?url";
import victoryArtUrl from "./art/victory.jpg?url";
import defeatArtUrl from "./art/defeat.jpg?url";
import type { AppStoreClient } from "../client";
import {
	clampSettings,
	DEFAULT_FORGE_SETTINGS,
	LEADERBOARD_ID,
	MAX_HP,
	PRESENCE_THROTTLE_MS,
	settingsKey,
	type ForgeSettings,
} from "../synced-store/constants";
import { readForgeSettings } from "../synced-store/data/index";
import type { Claim, ForgeSettingsRow, Player } from "../synced-store/schema";
import type {
	DungeonForgeHandle,
	DungeonForgeOptions,
	GameEvent,
} from "./game/dungeon-forge";

export interface PoeBridge {
	tileEnd: (input: {
		leaderboardId: string;
	}) => Promise<{ outcome?: string; playAgain?: boolean }>;
	haptics?: {
		impact: (style: string) => void;
		notification: (type: string) => void;
	};
	openProfile?: (userId: string) => void;
}

export interface MountOptions {
	/** Overridable in tests — the default lazy-loads the WebGL engine. */
	createEngine?: (
		options: DungeonForgeOptions,
	) => Promise<DungeonForgeHandle> | DungeonForgeHandle;
	suppressLongPressMagnifier?: (element: HTMLElement) => () => void;
	getCurrentUserId?: () => Promise<string>;
	poe?: PoeBridge;
	now?: () => number;
	/** Beat between the end banner appearing and the host overlay (ms). */
	endBeatMs?: number;
}

const MUTATE_DEBOUNCE_MS = 350;
const END_BEAT_MS = 1100;

async function defaultCreateEngine(
	options: DungeonForgeOptions,
): Promise<DungeonForgeHandle> {
	const { initDungeonForge } = await import("./game/dungeon-forge.js");
	return initDungeonForge(options);
}

function rowToSettings(row: ForgeSettingsRow): ForgeSettings {
	return clampSettings({
		seed: row.seed,
		theme: row.theme,
		rooms: row.rooms,
		loopiness: row.loopiness,
		decor: row.decor,
	});
}

/* The game HUD is the primary surface; the full forge panel stays tucked
   behind the ⚒ button so the screen belongs to the dungeon. */
const APP_HTML = `
	<div id="dungeon-host" aria-label="Dungeon view"></div>

	<div class="df-hud" id="hud">
		<div class="df-hud-left">
			<div class="df-hpwrap" role="meter" aria-label="Health">
				<div class="df-hp" id="hudHp" style="width:100%"></div>
				<span class="df-hplabel" id="hudHpText">100</span>
			</div>
			<div class="df-gold" aria-label="Gold">🪙 <b id="hudGold">0</b></div>
			<div class="df-best" id="hudBest" hidden></div>
			<div class="df-players" id="hudPlayers" aria-label="Other players"></div>
		</div>
		<div class="df-hud-right">
			<button class="df-iconbtn" id="hudAgain" hidden>⚔ PLAY AGAIN</button>
			<button class="df-iconbtn" id="hudHelp" aria-label="How to play" title="How to play">?</button>
			<button class="df-iconbtn" id="hudForge" aria-label="Forge settings" title="Forge settings">⚒</button>
		</div>
	</div>

	<div class="df-hint" id="hint">Tap a tile to walk · grab 🪙 chests · <b style="color:var(--blood)">☠ = enemies</b> · reach the big pulsing ☠ alive</div>

	<div class="df-help" id="help" hidden>
		<b>How to play</b>
		<p><b>Tap anywhere</b> — your hero walks there. Reach the boss alive to clear the floor and bank your gold.</p>
		<table class="df-helptable" aria-label="What to grab and what to avoid">
			<tbody>
				<tr class="df-help-head"><th colspan="2">✓ GRAB THESE</th></tr>
				<tr>
					<td><span class="dot" style="background:#f4c95c"></span> Coins &amp; <span class="dot" style="background:#7fe8d0"></span> gems</td>
					<td>free gold on the floor (+5 / +15) — just walk over them</td>
				</tr>
				<tr>
					<td><span class="dot" style="background:var(--gold)"></span> Wooden chests</td>
					<td>+35 gold, free</td>
				</tr>
				<tr>
					<td><span class="dot" style="background:var(--blue)"></span> Blue shrine crystals</td>
					<td>full heal, once each</td>
				</tr>
				<tr>
					<td><span class="dot" style="background:var(--gold)"></span> Big pulsing gold ☠</td>
					<td><b>the BOSS</b> — reach it alive to win the floor (costs 30&nbsp;HP)</td>
				</tr>
				<tr class="df-help-head df-help-bad"><th colspan="2">✗ THESE COST YOU BLOOD</th></tr>
				<tr>
					<td><span class="dot" style="background:#b03a2a"></span> Spires with a red ☠</td>
					<td>enemies — walking near one costs 6–20&nbsp;HP (they do drop gold)</td>
				</tr>
			</tbody>
		</table>
		<p>HP never regens on its own — plan a route that leaves enough blood for the boss. Everyone in the room plays the same floor: loot is first-come-first-served, and the first to fell the boss wins the race.</p>
		<p>Drag to look around · pinch or scroll to zoom · ⚒ reforges the dungeon for the whole room.</p>
		<button class="df-iconbtn" id="helpClose">GOT IT</button>
	</div>

	<div class="df-endcard" id="endcard" hidden>
		<img class="df-endart" id="endArt" alt="">
		<div class="df-endtitle" id="endTitle"></div>
		<div class="df-endsub" id="endSub"></div>
	</div>

	<div id="panel" hidden>
		<button id="collapse" aria-label="Collapse panel" title="Collapse">–</button>
		<div class="head">
			<div class="brand"><span>DUNGEON&nbsp;FORGE</span><span>procgen&nbsp;core</span></div>
			<h1 id="dname">—</h1>
			<div id="dsub">forging…</div>
		</div>

		<ul class="pipe" id="pipe" aria-label="Generation pipeline">
			<li>SCATTER</li><li>SEPARATE</li><li>DELAUNAY</li><li>MST+LOOPS</li><li>CARVE</li><li>THEME</li>
		</ul>

		<div class="sec">
			<div class="row">
				<label style="flex:1"><span class="lab"><span>SEED</span></span>
					<div class="row">
						<input id="seed" type="number" value="1337" aria-label="Seed">
						<button class="btn" id="dice" title="Random seed" aria-label="Random seed">⚄</button>
					</div>
				</label>
			</div>
			<button class="btn primary" id="forge" style="width:100%;margin-top:10px">FORGE&nbsp;DUNGEON</button>
		</div>

		<div class="sec">
			<span class="lab"><span>THEME</span><b id="vTheme">AUTO</b></span>
			<div class="chips" id="chips">
				<button class="chip on" data-t="auto">AUTO</button>
				<button class="chip" data-t="ancient">ANCIENT</button>
				<button class="chip" data-t="molten">MOLTEN</button>
				<button class="chip" data-t="frost">FROST</button>
				<button class="chip" data-t="grim">GRIM</button>
				<button class="chip" data-t="verdant">VERDANT</button>
			</div>
		</div>

		<div class="sec">
			<span class="lab"><span>OBJECTS</span><span style="color:#4a4f61">tap to toggle</span></span>
			<div class="chips" id="objchips">
				<button class="chip on" data-o="props" aria-pressed="true">PROPS</button>
				<button class="chip on" data-o="torches" aria-pressed="true">TORCHES</button>
				<button class="chip on" data-o="particles" aria-pressed="true">PARTICLES</button>
				<button class="chip on" data-o="liquids" aria-pressed="true">LIQUIDS</button>
				<button class="chip on" data-o="lights" aria-pressed="true">LIGHTS</button>
			</div>
		</div>

		<div class="sec">
			<label class="sl"><span class="lab"><span>ROOMS</span><b id="vRooms">42</b></span>
				<input type="range" id="rooms" min="12" max="80" value="42" aria-label="Room count"></label>
			<label class="sl"><span class="lab"><span>LOOPINESS</span><b id="vLoops">15%</b></span>
				<input type="range" id="loops" min="0" max="40" value="15" aria-label="Loop chance"></label>
			<label class="sl"><span class="lab"><span>DECOR&nbsp;DENSITY</span><b id="vDecor">60%</b></span>
				<input type="range" id="decor" min="0" max="100" value="60" aria-label="Decoration density"></label>
		</div>

		<div class="sec togs">
			<label class="tog"><input type="checkbox" id="tGraph"> Graph overlay <span class="key">G</span></label>
			<label class="tog"><input type="checkbox" id="tHeat"> Difficulty heatmap <span class="key">H</span></label>
			<label class="tog"><input type="checkbox" id="tAnim" checked> Animate build <span class="key">SPACE&nbsp;skips</span></label>
			<label class="tog"><input type="checkbox" id="tPost" checked> Post FX <span class="key">P</span></label>
		</div>

		<div class="sec legend" aria-label="Room type legend">
			<span class="lg"><span class="dot" style="background:var(--teal)"></span>Entrance</span>
			<span class="lg"><span class="dot" style="background:#8f95a3"></span>Combat</span>
			<span class="lg"><span class="dot" style="background:var(--violet)"></span>Elite</span>
			<span class="lg"><span class="dot" style="background:var(--gold)"></span>Treasure</span>
			<span class="lg"><span class="dot" style="background:var(--blue)"></span>Shrine</span>
			<span class="lg"><span class="dot" style="background:var(--blood)"></span>Boss</span>
		</div>

		<div class="sec stats">
			<div class="st"><i>ROOMS</i><b id="sRooms">—</b></div>
			<div class="st"><i>LINKS·LOOPS</i><b id="sEdges">—</b></div>
			<div class="st"><i>CRIT&nbsp;PATH</i><b id="sCrit">—</b></div>
			<div class="st"><i>FLOOR&nbsp;TILES</i><b id="sTiles">—</b></div>
			<div class="st"><i>LIGHTS</i><b id="sLights">—</b></div>
			<div class="st"><i>GEN&nbsp;TIME</i><b id="sMs" class="hi">—</b></div>
			<div class="st"><i>DRAW&nbsp;CALLS</i><b id="sCalls">—</b></div>
			<div class="st"><i>TRIANGLES</i><b id="sTris">—</b></div>
			<div class="st"><i>FPS</i><b id="sFps">—</b></div>
		</div>
	</div>
`;

export async function mountApp(
	root: HTMLElement,
	store: AppStoreClient,
	options: MountOptions = {},
): Promise<() => void> {
	const createEngine = options.createEngine ?? defaultCreateEngine;
	const now = options.now ?? (() => Date.now());
	const endBeatMs = options.endBeatMs ?? END_BEAT_MS;

	const app = document.createElement("div");
	app.className = "df-app";
	root.replaceChildren(app);

	// Visible loading state while the store bootstraps and the engine loads —
	// never a blank iframe.
	const loading = document.createElement("div");
	loading.className = "df-loading";
	loading.innerHTML = `<img class="df-loading-art" alt="" src="${loadingArtUrl}"><div class="df-loading-text">Forging the dungeon…</div>`;
	app.appendChild(loading);

	let destroyed = false;
	let engine: DungeonForgeHandle | undefined;
	const unsubs: Array<() => void> = [];
	let removeMagnifierSuppression = (): void => {};
	let mutateTimer: ReturnType<typeof setTimeout> | undefined;
	let endTimer: ReturnType<typeof setTimeout> | undefined;
	let presenceTimer: ReturnType<typeof setTimeout> | undefined;
	let presenceSentAt = 0;
	let endingRun = false;
	let userId = "viewer";
	// Key of the settings we last saw persisted (or just pushed) — used to
	// break the echo loop between local forges and remote store updates.
	let lastSyncedKey: string | null = null;

	function showError(message: string): void {
		loading.remove();
		const alert = document.createElement("div");
		alert.className = "df-error";
		alert.setAttribute("role", "alert");
		alert.textContent = message;
		app.appendChild(alert);
	}

	function teardown(): void {
		destroyed = true;
		if (mutateTimer) clearTimeout(mutateTimer);
		if (endTimer) clearTimeout(endTimer);
		if (presenceTimer) clearTimeout(presenceTimer);
		for (const unsub of unsubs) unsub();
		removeMagnifierSuppression();
		engine?.destroy();
		app.remove();
	}

	try {
		if (options.getCurrentUserId) userId = await options.getCurrentUserId();
		await store.waitForBootstrap();
	} catch (error) {
		console.error("Procedural Dungeon failed to bootstrap", error);
		showError("Couldn't load the dungeon. Please close and reopen the tile.");
		return teardown;
	}
	if (destroyed) return teardown;

	const savedRow = await store.query((ctx) => readForgeSettings(ctx));
	if (destroyed) return teardown;
	const initialSettings = savedRow
		? rowToSettings(savedRow)
		: DEFAULT_FORGE_SETTINGS;
	lastSyncedKey = savedRow ? settingsKey(initialSettings) : null;

	// Persist local forges to the shared store (debounced — slider drags forge
	// on every nudge). Skipped when the forge came from a remote update.
	function persistSettings(settings: ForgeSettings): void {
		const key = settingsKey(settings);
		if (key === lastSyncedKey) return;
		lastSyncedKey = key;
		if (mutateTimer) clearTimeout(mutateTimer);
		mutateTimer = setTimeout(() => {
			if (destroyed) return;
			void store.mutate.setForgeSettings({
				...settings,
				updatedAt: now(),
				updatedBy: userId,
			});
		}, MUTATE_DEBOUNCE_MS);
	}

	loading.remove();
	app.insertAdjacentHTML("beforeend", APP_HTML);
	const $ = <T extends HTMLElement>(id: string) =>
		app.querySelector<T>(`#${id}`);
	const hostMaybe = $("dungeon-host");
	const panelMaybe = $("panel");
	const hintMaybe = $("hint");
	const helpMaybe = $("help");
	const endcardMaybe = $("endcard");
	const hudAgainMaybe = $<HTMLButtonElement>("hudAgain");
	if (
		!hostMaybe ||
		!panelMaybe ||
		!hintMaybe ||
		!helpMaybe ||
		!endcardMaybe ||
		!hudAgainMaybe
	) {
		showError("Couldn't load the dungeon. Please close and reopen the tile.");
		return teardown;
	}
	const host = hostMaybe;
	const panel = panelMaybe;
	const hint = hintMaybe;
	const help = helpMaybe;
	const endcard = endcardMaybe;
	const hudAgain = hudAgainMaybe;

	// ─── HUD wiring ────────────────────────────────────────────────────────────
	$("hudForge")?.addEventListener("click", () => {
		panel.hidden = !panel.hidden;
	});
	$("hudHelp")?.addEventListener("click", () => {
		help.hidden = !help.hidden;
	});
	$("helpClose")?.addEventListener("click", () => {
		help.hidden = true;
	});
	hudAgain.addEventListener("click", () => {
		hudAgain.hidden = true;
		endcard.hidden = true;
		engine?.game.newRun(0);
	});

	function updateHud(ev: Extract<GameEvent, { type: "hud" }>): void {
		const hpEl = $("hudHp");
		const hpText = $("hudHpText");
		const goldEl = $("hudGold");
		if (hpEl) {
			const pct = Math.round((ev.hp / ev.maxHp) * 100);
			hpEl.style.width = `${pct}%`;
			hpEl.classList.toggle("low", pct <= 30);
		}
		if (hpText) hpText.textContent = String(ev.hp);
		if (goldEl) goldEl.textContent = String(ev.gold);
	}

	// ─── Live presence: publish my position/state, throttled while walking ────
	const presence = {
		cell: null as { x: number; y: number } | null,
		hp: MAX_HP,
		gold: 0,
		over: false,
		victory: false,
	};
	function sendPresence(): void {
		if (destroyed) return;
		presenceSentAt = Date.now();
		void store.mutate.updatePlayer({
			userId,
			cell: presence.cell,
			hp: presence.hp,
			gold: presence.gold,
			over: presence.over,
			victory: presence.victory,
			updatedAt: now(),
		});
	}
	function queuePresence(immediate = false): void {
		if (destroyed) return;
		const wait = immediate
			? 0
			: Math.max(0, PRESENCE_THROTTLE_MS - (Date.now() - presenceSentAt));
		if (presenceTimer) clearTimeout(presenceTimer);
		presenceTimer = setTimeout(sendPresence, wait);
	}

	// ─── End-of-run flow: banner → readable beat → platform overlay ───────────
	async function handleRunEnd(
		ev: Extract<GameEvent, { type: "end" }>,
	): Promise<void> {
		if (endingRun || destroyed) return;
		endingRun = true;
		presence.over = true;
		presence.victory = ev.victory;
		presence.gold = ev.gold;
		queuePresence(true);
		const title = $("endTitle");
		const sub = $("endSub");
		const art = $<HTMLImageElement>("endArt");
		if (art) art.src = ev.victory ? victoryArtUrl : defeatArtUrl;
		if (title)
			title.textContent = ev.victory
				? "⚔ FLOOR CLEARED"
				: ev.external
					? "🏁 RACE OVER"
					: "☠ YOU FELL";
		if (sub)
			sub.textContent = ev.victory
				? `${ev.name} — ${ev.gold} gold banked`
				: ev.external
					? `${ev.winner} felled the boss first · your ${ev.gold} gold is banked`
					: `${ev.name} claims another adventurer · ${ev.gold} gold banked`;
		endcard.classList.toggle("win", ev.victory);
		endcard.hidden = false;

		const runId = await store.makeUniqueId();
		void store.mutate.recordRun({
			userId,
			runId,
			gold: ev.gold,
			victory: ev.victory,
			seed: ev.seed,
			createdAt: now(),
		});

		// Let the decisive banner land before the host overlay covers it.
		await new Promise<void>((resolve) => {
			endTimer = setTimeout(resolve, endBeatMs);
		});
		endingRun = false;
		if (destroyed) return;

		let playAgain = false;
		if (options.poe) {
			try {
				const result = await options.poe.tileEnd({
					leaderboardId: LEADERBOARD_ID,
				});
				playAgain =
					result.playAgain === true || result.outcome === "playAgain";
			} catch (error) {
				console.error("tileEnd failed", error);
			}
		}
		if (destroyed) return;
		endcard.hidden = true;
		// The overlay may resolve long after the player already reforged from
		// the panel — only act if this run is still the one that ended.
		if (engine && !engine.game.state().over) return;
		if (playAgain) {
			// Victory descends to the next floor; defeat retries this one.
			engine?.game.newRun(ev.victory ? 1 : 0);
		} else {
			hudAgain.hidden = false;
		}
	}

	function onGameEvent(ev: GameEvent): void {
		if (destroyed) return;
		if (ev.type === "hud") {
			updateHud(ev);
			presence.hp = ev.hp;
			presence.gold = ev.gold;
			if (!ev.over) {
				presence.over = false;
				presence.victory = false;
				hudAgain.hidden = true;
				endcard.hidden = true;
			}
		} else if (ev.type === "pos") {
			presence.cell = ev.cell;
			presence.hp = ev.hp;
			presence.gold = ev.gold;
			queuePresence();
		} else if (ev.type === "claim") {
			void store.mutate.claimPoi({ userId, key: ev.key, at: now() });
		} else if (ev.type === "profile") {
			options.poe?.openProfile?.(ev.userId);
		} else if (ev.type === "firstMove") {
			hint.hidden = true;
		} else if (ev.type === "fx") {
			const h = options.poe?.haptics;
			if (!h) return;
			if (ev.kind === "hit") h.impact("medium");
			else if (ev.kind === "gold") h.impact("light");
			else if (ev.kind === "heal") h.notification("success");
			else if (ev.kind === "win") h.notification("success");
			else if (ev.kind === "death") h.notification("error");
		} else if (ev.type === "end") {
			void handleRunEnd(ev);
		}
	}

	// ─── Engine boot ───────────────────────────────────────────────────────────
	try {
		engine = await createEngine({
			root: app,
			host,
			initialSettings,
			onSettingsChange: persistSettings,
			onGameEvent,
		});
	} catch (error) {
		console.error("Procedural Dungeon renderer failed to start", error);
		showError(
			"This device couldn't start the 3D renderer (WebGL is required).",
		);
		return teardown;
	}
	if (destroyed) {
		teardown();
		return teardown;
	}
	if (options.suppressLongPressMagnifier) {
		removeMagnifierSuppression = options.suppressLongPressMagnifier(
			engine.canvas,
		);
	}

	// Live-follow the shared settings: when someone else in the room forges,
	// this client re-forges the identical dungeon.
	unsubs.push(
		store.subscribe(
			(ctx) => readForgeSettings(ctx),
			(row) => {
				if (destroyed || !row || !engine) return;
				const settings = rowToSettings(row);
				const key = settingsKey(settings);
				if (key === lastSyncedKey) return;
				lastSyncedKey = key;
				engine.applySettings(settings);
			},
		),
	);

	// Other members' live heroes + HUD chips (names from $userInfo).
	unsubs.push(
		store.subscribe(
			async (ctx) => {
				const rows = (await ctx
					.table("players")
					.scan()
					.values()
					.toArray()) as Player[];
				const others = rows.filter((p) => p.userId !== userId);
				return Promise.all(
					others.map(async (p) => {
						const info = (await ctx.table("$userInfo").get(p.userId)) as
							| { displayName?: string }
							| undefined;
						return {
							userId: p.userId,
							name: info?.displayName ?? "Adventurer",
							cell: p.cell,
							over: p.over,
							gold: p.gold,
						};
					}),
				);
			},
			(players) => {
				if (destroyed || !engine) return;
				engine.game.setRemotePlayers(players);
				const chips = $("hudPlayers");
				if (!chips) return;
				chips.replaceChildren(
					...players.map((p) => {
						const chip = document.createElement("button");
						chip.type = "button";
						chip.className = "df-playerchip";
						chip.textContent = `${p.over ? "☠ " : ""}${p.name} · ${p.gold}g`;
						chip.addEventListener("click", () =>
							options.poe?.openProfile?.(p.userId),
						);
						return chip;
					}),
				);
			},
		),
	);

	// Shared-world claims: hide loot/enemies taken by others; end the race if
	// someone else felled the boss.
	unsubs.push(
		store.subscribe(
			async (ctx) => {
				const claims = (await ctx
					.table("claims")
					.scan()
					.values()
					.toArray()) as Claim[];
				const bossClaim = claims.find(
					(c) => c.key === "boss" && c.userId !== userId,
				);
				let bossWinnerName: string | null = null;
				if (bossClaim) {
					const info = (await ctx.table("$userInfo").get(bossClaim.userId)) as
						| { displayName?: string }
						| undefined;
					bossWinnerName = info?.displayName ?? "Another adventurer";
				}
				return {
					keys: claims.filter((c) => c.userId !== userId).map((c) => c.key),
					bossWinnerName,
				};
			},
			(result) => {
				if (destroyed || !engine) return;
				engine.game.applyClaims(result.keys, result.bossWinnerName);
			},
		),
	);

	// Live "score to beat" chip — only rendered once the board has a real score.
	unsubs.push(
		store.subscribe(
			async (ctx) => {
				const board = await getLeaderboard(ctx, {
					leaderboardId: LEADERBOARD_ID,
				});
				if (!board.entries.length) return null;
				const top = [...board.entries].sort((a, b) => b.score - a.score)[0];
				const info = (await ctx.table("$userInfo").get(top.userId)) as
					| { displayName?: string }
					| undefined;
				return { score: top.score, name: info?.displayName ?? "someone" };
			},
			(best) => {
				if (destroyed) return;
				const el = $("hudBest");
				if (!el) return;
				if (!best) {
					el.hidden = true;
					return;
				}
				el.hidden = false;
				el.textContent = `👑 ${best.score}g · ${best.name}`;
			},
		),
	);

	return teardown;
}
