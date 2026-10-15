import { describe, expect, it, test } from "bun:test";
import {
	dropProjectOnProject,
	dropProjectOnSection,
	hasInFlightRowWrite,
	planExternalSync,
	toStoredProjectLane,
} from "./useSidebarDnd";

const dropped = new Set(["a", "b"]);

describe("hasInFlightRowWrite", () => {
	test("holds while a row the drop wrote has an unsettled host update", () => {
		expect(hasInFlightRowWrite({ a: { type: "update" } }, dropped)).toBe(true);
		expect(hasInFlightRowWrite({ b: { type: "update" } }, dropped)).toBe(true);
	});

	test("ignores updates for rows the drop did not touch", () => {
		expect(hasInFlightRowWrite({ zzz: { type: "update" } }, dropped)).toBe(
			false,
		);
	});

	test("does not hold on inserts or deletes", () => {
		expect(
			hasInFlightRowWrite(
				{ a: { type: "insert" }, b: { type: "delete" } },
				dropped,
			),
		).toBe(false);
	});

	test("is false with nothing in flight or nothing dropped", () => {
		expect(hasInFlightRowWrite({}, dropped)).toBe(false);
		expect(hasInFlightRowWrite({ a: { type: "update" } }, new Set())).toBe(
			false,
		);
	});
});

describe("planExternalSync", () => {
	test("holds while the drop's write is in flight, whatever the props say", () => {
		expect(
			planExternalSync({
				inFlight: true,
				wasHeld: false,
				fingerprint: "stale",
				prevFingerprint: "synced",
			}),
		).toBe("hold");
	});

	test("syncs on a data change when nothing was held", () => {
		expect(
			planExternalSync({
				inFlight: false,
				wasHeld: false,
				fingerprint: "b",
				prevFingerprint: "a",
			}),
		).toBe("sync");
	});

	test("skips when nothing changed and nothing was held", () => {
		expect(
			planExternalSync({
				inFlight: false,
				wasHeld: false,
				fingerprint: "a",
				prevFingerprint: "a",
			}),
		).toBe("skip");
	});

	test("rejected write: props roll back to the pre-drop shape, still reconciles", () => {
		// The hold kept the optimistic order on screen; the rolled-back props
		// fingerprint exactly what was last synced, so only the held flag can
		// force the model back to the truth.
		expect(
			planExternalSync({
				inFlight: false,
				wasHeld: true,
				fingerprint: "pre-drop",
				prevFingerprint: "pre-drop",
			}),
		).toBe("sync");
	});
});

describe("toStoredProjectLane", () => {
	it("unwraps section ids for persistence", () => {
		expect(
			toStoredProjectLane(["psec::work", "b", "a"], { b: "psec::work" }),
		).toEqual([
			{ type: "section", id: "work" },
			{ type: "project", id: "b", sectionId: "work" },
			{ type: "project", id: "a", sectionId: null },
		]);
	});
});

describe("dropProjectOnProject", () => {
	const lane = {
		ids: ["psec::work", "w1", "x", "psec::closed", "c1", "y", "z"],
		membership: { w1: "psec::work", c1: "psec::closed" },
		collapsedSectionIds: new Set(["psec::closed"]),
	};

	it("takes the section of the project it lands on", () => {
		const down = dropProjectOnProject(lane, "x", "w1");
		expect(down?.ids.slice(0, 3)).toEqual(["psec::work", "x", "w1"]);
		expect(down?.membership.x).toBe("psec::work");
		const up = dropProjectOnProject(lane, "w1", "x");
		expect(up?.ids.slice(0, 3)).toEqual(["psec::work", "x", "w1"]);
		expect(up?.membership.w1).toBeUndefined();
	});

	it("moves up to stay top-level right below a section", () => {
		const dropped = dropProjectOnProject(lane, "z", "y");
		expect(dropped?.ids.slice(3)).toEqual(["psec::closed", "c1", "z", "y"]);
		expect(dropped?.membership.z).toBeUndefined();
	});

	it("never joins a collapsed section", () => {
		expect(dropProjectOnProject(lane, "y", "c1")?.membership.y).toBeUndefined();
	});

	it("keeps a collapsed section's own member in it", () => {
		const rail = {
			...lane,
			ids: [...lane.ids, "c2"],
			membership: { ...lane.membership, c2: "psec::closed" },
		};
		expect(dropProjectOnProject(rail, "c1", "c2")?.membership.c1).toBe(
			"psec::closed",
		);
	});

	it("changes nothing when dropped on itself", () => {
		expect(dropProjectOnProject(lane, "x", "x")).toBeNull();
	});
});

describe("dropProjectOnSection", () => {
	const lane = {
		ids: ["psec::empty", "psec::work", "w1", "psec::closed", "c1", "x"],
		membership: { w1: "psec::work", c1: "psec::closed" },
		collapsedSectionIds: new Set(["psec::closed"]),
	};

	it("drops into an empty section above the project, not beside it", () => {
		const dropped = dropProjectOnSection(lane, "x", "psec::empty");
		expect(dropped.ids.slice(0, 2)).toEqual(["psec::empty", "x"]);
		expect(dropped.membership.x).toBe("psec::empty");
	});

	it("goes first in an open section and last in a collapsed one", () => {
		expect(dropProjectOnSection(lane, "x", "psec::work").ids).toEqual([
			"psec::empty",
			"psec::work",
			"x",
			"w1",
			"psec::closed",
			"c1",
		]);
		expect(dropProjectOnSection(lane, "w1", "psec::closed").ids).toEqual([
			"psec::empty",
			"psec::work",
			"psec::closed",
			"c1",
			"w1",
			"x",
		]);
	});
});
