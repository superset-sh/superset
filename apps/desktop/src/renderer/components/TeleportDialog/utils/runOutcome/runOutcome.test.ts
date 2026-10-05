import { describe, expect, it } from "bun:test";
import { TELEPORT_STEPS } from "@superset/shared/teleport";
import type { TeleportRunState } from "../../types";
import { applyTeleportProgress, deriveRunOutcome } from "./runOutcome";

const allDone: TeleportRunState = {
	steps: Object.fromEntries(TELEPORT_STEPS.map((step) => [step, "done"])),
	error: null,
};

describe("deriveRunOutcome", () => {
	it("is running before anything has happened", () => {
		expect(deriveRunOutcome({ steps: {}, error: null })).toBe("running");
	});

	it("is running while any step is still open", () => {
		const [first, ...rest] = TELEPORT_STEPS;
		const run: TeleportRunState = {
			steps: {
				[first]: "done",
				...Object.fromEntries(rest.map((step) => [step, "running"])),
			},
			error: null,
		};
		expect(deriveRunOutcome(run)).toBe("running");
	});

	it("is done once every step is done", () => {
		expect(deriveRunOutcome(allDone)).toBe("done");
	});

	it("is failed as soon as the run carries an error", () => {
		expect(
			deriveRunOutcome({ ...allDone, error: "The sandbox never answered" }),
		).toBe("failed");
	});
});

describe("applyTeleportProgress", () => {
	it("records a step's state", () => {
		const run = applyTeleportProgress(
			{ steps: {}, error: null },
			{ step: "capture", state: "running" },
		);
		expect(run.steps.capture).toBe("running");
		expect(run.error).toBeNull();
	});

	it("keeps the first error when later events carry none", () => {
		const failed = applyTeleportProgress(
			{ steps: {}, error: null },
			{ step: "restore", state: "failed", error: "no marker" },
		);
		const later = applyTeleportProgress(failed, {
			step: "stopSource",
			state: "done",
		});
		expect(later.error).toBe("no marker");
	});
});
