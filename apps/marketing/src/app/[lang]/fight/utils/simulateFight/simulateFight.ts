import { ANCHORS, axisScore } from "@superset/trpc/leaderboard-tier";

export interface FighterAxes {
	width: number;
	depth: number;
	output: number;
	sustain: number;
	cost: number;
}

export interface Fighter {
	handle: string;
	name: string;
	tier: number;
	axes: FighterAxes;
}

export type Side = "a" | "b";

export interface Kit {
	hp: number;
	swing: number;
	hits: number;
	crit: number;
	armor: number;
	rating: number;
}

export interface FightEvent {
	turn: number;
	attacker: Side;
	move: string;
	line: string;
	damage: number;
	blocked: number;
	crit: boolean;
	hp: Record<Side, number>;
}

export interface FightResult {
	kits: Record<Side, Kit>;
	events: FightEvent[];
	winner: Side;
	loser: Side;
	epitaph: string;
}

export const MAX_TURNS = 40;

const clamp = (value: number, lo: number, hi: number) =>
	Math.min(hi, Math.max(lo, value));

function seedFrom(a: string, b: string): number {
	const key = [a, b].sort().join("::");
	let hash = 2166136261;
	for (let i = 0; i < key.length; i++) {
		hash ^= key.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function mulberry32(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let r = Math.imul(state ^ (state >>> 15), 1 | state);
		r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

const costScore = (cost: number) =>
	axisScore(cost, ANCHORS.cost[0], ANCHORS.cost[1], true);

export function buildKit(fighter: Fighter): Kit {
	const { width, depth, output, sustain, cost } = fighter.axes;
	const hp = Math.round(70 + clamp(sustain, 0, 30) * 3.5);
	const hits = clamp(Math.round(width), 1, 4);
	const swing = Math.round(
		(4 + clamp(depth / 1e6, 0, 40) * 0.3) * (1 + (hits - 1) * 0.3) * 1.8,
	);
	const crit = clamp(output * 0.035, 0, 0.4);
	const armor = costScore(cost) * 0.3;
	const expectedSwing = swing * (1 + crit * 0.8);
	const effectiveHp = hp / (1 - armor);
	const rating = Math.round((expectedSwing * effectiveHp) / 10);
	return { hp, swing, hits, crit, armor, rating };
}

type AxisName = keyof FighterAxes;

interface Move {
	move: string;
	line: string;
}

const MOVES: Record<AxisName, Move[]> = {
	depth: [
		{
			move: "CONTEXT WINDOW SLAM",
			line: "%A drops an entire monorepo into context. %B goes down under the weight.",
		},
		{
			move: "ONE-SHOT PROMPT",
			line: "%A one-shots it. %B has been iterating on this since Tuesday.",
		},
		{
			move: "DEEP THOUGHT",
			line: "%A thinks for nine minutes, swings once, and it lands.",
		},
		{
			move: "TOKEN AVALANCHE",
			line: "%A buries %B in reasoning tokens nobody will ever read.",
		},
		{
			move: "THE BIG REFACTOR",
			line: "%A touches 412 files in one commit. %B cannot review it in time.",
		},
	],
	width: [
		{
			move: "AGENT SWARM",
			line: "%A forks %H agents. Every one of them goes for %B.",
		},
		{
			move: "PARALLEL UNIVERSE",
			line: "%A opens %H worktrees and attacks from all of them at once.",
		},
		{
			move: "FAN OUT",
			line: "%A fans out %H ways. %B can only block one of them.",
		},
		{
			move: "TAB EXPLOSION",
			line: "%A opens %H terminals. %B's fans spin up in sympathy.",
		},
		{
			move: "PINCER REVIEW",
			line: "%A reviews %B from %H directions simultaneously.",
		},
	],
	output: [
		{
			move: "MERGE SLAM",
			line: "%A slams a merged PR straight into %B's ribs.",
		},
		{
			move: "SQUASH AND MERGE",
			line: "%A squashes %B down into a single commit.",
		},
		{
			move: "SHIP IT",
			line: "%A deploys on a Friday. %B is inside the blast radius.",
		},
		{
			move: "LGTM",
			line: "%A approves their own PR. %B felt that one.",
		},
		{
			move: "CLOSED AS DUPLICATE",
			line: "%A closes %B's ticket as a duplicate. No further comment.",
		},
	],
	sustain: [
		{
			move: "THE GRIND",
			line: "%A has done this %S days running. %B is tired just watching.",
		},
		{
			move: "NO WEEKENDS",
			line: "%A does not appear to know what a Saturday is.",
		},
		{
			move: "GREEN SQUARES",
			line: "%A extends the streak. %B's contribution graph goes grey.",
		},
		{
			move: "03:00 COMMIT",
			line: "%A commits at three in the morning. %B was asleep, like a coward.",
		},
		{
			move: "SECOND WIND",
			line: "%A refills the coffee and keeps going. %B checks the clock.",
		},
	],
	cost: [
		{
			move: "THE INVOICE",
			line: "%A shows %B the bill. %B does not recover from it.",
		},
		{
			move: "CACHE HIT",
			line: "%A pays nothing for that swing. %B pays full price for everything.",
		},
		{
			move: "HAIKU MODE",
			line: "%A switches to the cheap model and still wins the exchange.",
		},
		{
			move: "PROMPT GOLF",
			line: "%A does it in nine words. %B wrote three paragraphs.",
		},
		{
			move: "BUDGET GUARD",
			line: "%A blocks with a $%C-per-PR efficiency shield and counters.",
		},
	],
};

const CRIT_MOVES: Move[] = [
	{
		move: "FIRST TRY",
		line: "CRITICAL — %A goes green on the first run. Nobody does that.",
	},
	{
		move: "ONE COMMIT",
		line: "CRITICAL — %A lands the whole feature in one commit.",
	},
	{
		move: "ZERO RETRIES",
		line: "CRITICAL — %A's test suite passes without a single retry.",
	},
	{
		move: "NECROPOST",
		line: "CRITICAL — %A closes the issue %B just opened. It was open for 40 seconds.",
	},
	{
		move: "WORKS ON MY MACHINE",
		line: "CRITICAL — it works on %A's machine, and that is now %B's problem.",
	},
];

const EPITAPHS = [
	"%L survived %T rounds and still has unmerged branches.",
	"%L logged off. %L did not log back on.",
	"%L is now a rate limit warning in someone else's dashboard.",
	"%L will be back after a quick `git reset --hard`.",
	"%L blames the flaky test.",
];

const AXIS_CEILING: Record<Exclude<AxisName, "cost">, number> = {
	width: 12,
	depth: 40_000_000,
	output: 14,
	sustain: 30,
};

function axisScores(fighter: Fighter): Record<AxisName, number> {
	const { width, depth, output, sustain, cost } = fighter.axes;
	return {
		width: clamp(width / AXIS_CEILING.width, 0, 1),
		depth: clamp(depth / AXIS_CEILING.depth, 0, 1),
		output: clamp(output / AXIS_CEILING.output, 0, 1),
		sustain: clamp(sustain / AXIS_CEILING.sustain, 0, 1),
		cost: costScore(cost),
	};
}

export function advantageAxis(attacker: Fighter, defender: Fighter): AxisName {
	const mine = axisScores(attacker);
	const theirs = axisScores(defender);

	let best: AxisName = "depth";
	let bestLead = Number.NEGATIVE_INFINITY;
	for (const axis of Object.keys(mine) as AxisName[]) {
		const lead = (mine[axis] ?? 0) - (theirs[axis] ?? 0);
		if (lead > bestLead) {
			bestLead = lead;
			best = axis;
		}
	}
	return best;
}

const fill = (
	template: string,
	attacker: Fighter,
	defender: Fighter,
	hits: number,
) =>
	template
		.replaceAll("%A", attacker.name)
		.replaceAll("%B", defender.name)
		.replaceAll("%H", String(hits))
		.replaceAll("%S", String(Math.round(attacker.axes.sustain)))
		.replaceAll("%C", attacker.axes.cost.toFixed(2));

function openingSide(
	a: Fighter,
	b: Fighter,
	ratingA: number,
	ratingB: number,
): Side {
	if (ratingA !== ratingB) return ratingA > ratingB ? "a" : "b";
	return a.handle <= b.handle ? "a" : "b";
}

export function simulateFight(a: Fighter, b: Fighter): FightResult {
	const kits: Record<Side, Kit> = { a: buildKit(a), b: buildKit(b) };
	const fighters: Record<Side, Fighter> = { a, b };
	const rng = mulberry32(seedFrom(a.handle, b.handle));

	const hp: Record<Side, number> = { a: kits.a.hp, b: kits.b.hp };
	const events: FightEvent[] = [];

	let attacker: Side = openingSide(a, b, kits.a.rating, kits.b.rating);
	let turn = 1;
	const lastMove: Record<Side, number> = { a: -1, b: -1 };

	while (hp.a > 0 && hp.b > 0 && turn <= MAX_TURNS) {
		const defenderSide: Side = attacker === "a" ? "b" : "a";
		const atk = kits[attacker];
		const def = kits[defenderSide];

		const crit = rng() < atk.crit;
		const jitter = 0.98 + rng() * 0.04;
		const raw = Math.round(atk.swing * jitter * (crit ? 1.8 : 1));
		const damage = Math.max(1, Math.round(raw * (1 - def.armor)));

		hp[defenderSide] = Math.max(0, hp[defenderSide] - damage);

		const pool = crit
			? CRIT_MOVES
			: MOVES[advantageAxis(fighters[attacker], fighters[defenderSide])];
		let index = Math.floor(rng() * pool.length);
		if (index === lastMove[attacker]) index = (index + 1) % pool.length;
		lastMove[attacker] = index;
		const pick = pool[index] ?? pool[0];

		events.push({
			turn,
			attacker,
			move: pick?.move ?? "ATTACK",
			line: fill(
				pick?.line ?? "",
				fighters[attacker],
				fighters[defenderSide],
				atk.hits,
			),
			damage,
			blocked: Math.max(0, raw - damage),
			crit,
			hp: { ...hp },
		});

		attacker = defenderSide;
		turn++;
	}

	const winner: Side =
		hp.a === hp.b
			? openingSide(a, b, kits.a.rating, kits.b.rating)
			: hp.a > hp.b
				? "a"
				: "b";
	const loser: Side = winner === "a" ? "b" : "a";

	const epitaph = (EPITAPHS[Math.floor(rng() * EPITAPHS.length)] ?? "")
		.replaceAll("%L", fighters[loser].name)
		.replaceAll("%T", String(events.length));

	return { kits, events, winner, loser, epitaph };
}
