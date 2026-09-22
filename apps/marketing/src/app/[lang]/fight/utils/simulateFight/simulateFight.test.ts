import { describe, expect, it } from "bun:test";
import { HOUSE_FIGHTERS } from "../../constants";
import {
	advantageAxis,
	buildKit,
	MAX_TURNS,
	simulateFight,
} from "./simulateFight";

const byHandle = (handle: string) => {
	const fighter = HOUSE_FIGHTERS.find((entry) => entry.handle === handle);
	if (!fighter) throw new Error(`no fighter ${handle}`);
	return fighter;
};

describe("simulateFight", () => {
	it("is deterministic for the same pair", () => {
		const a = byHandle("tokengoblin");
		const b = byHandle("shipfast");
		expect(simulateFight(a, b)).toEqual(simulateFight(a, b));
	});

	it("plays the same fight whichever side you enter first", () => {
		const a = byHandle("rebaselord");
		const b = byHandle("nightowl");
		const forward = simulateFight(a, b);
		const reversed = simulateFight(b, a);
		expect(forward.kits.a.rating).toBe(reversed.kits.b.rating);
		expect(forward.events.length).toBe(reversed.events.length);
		expect(forward.winner === "a" ? a.handle : b.handle).toBe(
			reversed.winner === "a" ? b.handle : a.handle,
		);
	});

	it("gives the win to a clearly higher rating", () => {
		for (const a of HOUSE_FIGHTERS) {
			for (const b of HOUSE_FIGHTERS) {
				if (a.handle === b.handle) continue;
				const ratingA = buildKit(a).rating;
				const ratingB = buildKit(b).rating;
				const gap = Math.max(ratingA, ratingB) / Math.min(ratingA, ratingB);
				if (gap < 1.1) continue;

				const result = simulateFight(a, b);
				const stronger = ratingA >= ratingB ? "a" : "b";
				expect(`${a.handle}v${b.handle}:${result.winner}`).toBe(
					`${a.handle}v${b.handle}:${stronger}`,
				);
			}
		}
	});

	it("picks the same winner whichever handle is passed first", () => {
		for (const a of HOUSE_FIGHTERS) {
			for (const b of HOUSE_FIGHTERS) {
				if (a.handle >= b.handle) continue;
				const forward = simulateFight(a, b);
				const reversed = simulateFight(b, a);
				expect(forward.winner === "a" ? a.handle : b.handle).toBe(
					reversed.winner === "a" ? b.handle : a.handle,
				);
				expect(forward.events.length).toBe(reversed.events.length);
			}
		}
	});

	it("keeps equal ratings from being decided by argument order", () => {
		const [first] = HOUSE_FIGHTERS;
		if (!first) throw new Error("roster is empty");
		const twin = { ...first, handle: "zzclone", name: "Clone" };
		expect(buildKit(twin).rating).toBe(buildKit(first).rating);
		expect(simulateFight(first, twin).winner).toBe("a");
		expect(simulateFight(twin, first).winner).toBe("b");
	});

	it("resolves every roster pair well inside the turn cap", () => {
		for (const a of HOUSE_FIGHTERS) {
			for (const b of HOUSE_FIGHTERS) {
				if (a.handle === b.handle) continue;
				const { events } = simulateFight(a, b);
				expect(events.length).toBeGreaterThan(1);
				expect(events.length).toBeLessThan(MAX_TURNS);
			}
		}
	});

	it("never drops a fighter below zero hp", () => {
		const { events } = simulateFight(
			byHandle("yolomerge"),
			byHandle("nightowl"),
		);
		for (const event of events) {
			expect(event.hp.a).toBeGreaterThanOrEqual(0);
			expect(event.hp.b).toBeGreaterThanOrEqual(0);
		}
	});
});

describe("movesets", () => {
	it("picks the axis the attacker leads on, not their own biggest stat", () => {
		const goblin = byHandle("tokengoblin");
		const ship = byHandle("shipfast");
		expect(advantageAxis(goblin, ship)).toBe("depth");
		expect(advantageAxis(ship, goblin)).toBe("output");
	});

	it("gives the same fighter a different style against a different opponent", () => {
		const ship = byHandle("shipfast");
		const against = new Set(
			HOUSE_FIGHTERS.filter((f) => f.handle !== ship.handle).map((f) =>
				advantageAxis(ship, f),
			),
		);
		expect(against.size).toBeGreaterThan(1);
	});

	it("only ever swings from the attacker's own axis", () => {
		const a = byHandle("tokengoblin");
		const b = byHandle("shipfast");
		const { events } = simulateFight(a, b);
		const pools: Record<string, string[]> = {
			depth: [
				"CONTEXT WINDOW SLAM",
				"ONE-SHOT PROMPT",
				"DEEP THOUGHT",
				"TOKEN AVALANCHE",
				"THE BIG REFACTOR",
			],
			output: [
				"MERGE SLAM",
				"SQUASH AND MERGE",
				"SHIP IT",
				"LGTM",
				"CLOSED AS DUPLICATE",
			],
		};

		for (const event of events) {
			if (event.crit) continue;
			const [attacker, defender] = event.attacker === "a" ? [a, b] : [b, a];
			const axis = advantageAxis(attacker, defender);
			const pool = pools[axis];
			expect(pool).toBeDefined();
			expect(pool).toContain(event.move);
		}
	});

	it("fills the flavour placeholders", () => {
		const { events } = simulateFight(
			byHandle("budgethawk"),
			byHandle("nightowl"),
		);
		for (const event of events) {
			expect(event.line).not.toContain("%");
		}
	});
});
