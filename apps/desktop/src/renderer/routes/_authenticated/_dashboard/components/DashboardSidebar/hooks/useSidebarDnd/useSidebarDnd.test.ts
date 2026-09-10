import { describe, expect, test } from "bun:test";
import { hasInFlightRowWrite, planExternalSync } from "./useSidebarDnd";

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
