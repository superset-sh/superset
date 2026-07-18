import { describe, expect, it } from "bun:test";
import {
	type CodexPickerModel,
	planCodexPickerSelection,
} from "./planCodexPickerSelection";

/** Mirror of the live lineup the step-1 PTY runs verified against. */
const levels = (efforts: string[]) => efforts.map((effort) => ({ effort }));
const MODELS: CodexPickerModel[] = [
	{
		id: "gpt-5.6-sol",
		supportedReasoningLevels: levels([
			"low",
			"medium",
			"high",
			"xhigh",
			"max",
			"ultra",
		]),
		defaultReasoningLevel: "low",
	},
	{
		id: "gpt-5.6-terra",
		supportedReasoningLevels: levels([
			"low",
			"medium",
			"high",
			"xhigh",
			"max",
			"ultra",
		]),
		defaultReasoningLevel: "medium",
	},
	{
		id: "gpt-5.6-luna",
		supportedReasoningLevels: levels(["low", "medium", "high", "xhigh", "max"]),
		defaultReasoningLevel: "medium",
	},
	{
		id: "gpt-5.5",
		supportedReasoningLevels: levels(["low", "medium", "high", "xhigh"]),
		defaultReasoningLevel: "medium",
	},
];

describe("planCodexPickerSelection", () => {
	it("maps model position and base effort position to 1-based rows", () => {
		// PTY-verified: row 2 = terra, effort row 3 = high.
		expect(planCodexPickerSelection(MODELS, "gpt-5.6-terra", "high")).toEqual({
			modelRow: 2,
			effortRow: 3,
		});
		// PTY-verified: row 1 = sol, effort row 4 = xhigh.
		expect(planCodexPickerSelection(MODELS, "gpt-5.6-sol", "xhigh")).toEqual({
			modelRow: 1,
			effortRow: 4,
		});
	});

	it("routes max/ultra through the More-reasoning submenu row", () => {
		// PTY-verified: sol effort row 5 = "More reasoning…", submenu 1 = Max.
		expect(planCodexPickerSelection(MODELS, "gpt-5.6-sol", "max")).toEqual({
			modelRow: 1,
			effortRow: 5,
			submenuRow: 1,
		});
		expect(planCodexPickerSelection(MODELS, "gpt-5.6-terra", "ultra")).toEqual({
			modelRow: 2,
			effortRow: 5,
			submenuRow: 2,
		});
	});

	it("keeps submenu numbering tied to the model's own advanced levels", () => {
		// Luna supports max but not ultra: submenu still starts at 1.
		expect(planCodexPickerSelection(MODELS, "gpt-5.6-luna", "max")).toEqual({
			modelRow: 3,
			effortRow: 5,
			submenuRow: 1,
		});
		expect(
			planCodexPickerSelection(MODELS, "gpt-5.6-luna", "ultra"),
		).toBeNull();
	});

	it("returns null rather than guessing when the target is unreachable", () => {
		expect(planCodexPickerSelection(MODELS, "gpt-5.5", "max")).toBeNull();
		expect(planCodexPickerSelection(MODELS, "gpt-4o", "high")).toBeNull();
		expect(planCodexPickerSelection(MODELS, "gpt-5.5", "extreme")).toBeNull();
		expect(planCodexPickerSelection([], "gpt-5.5", "high")).toBeNull();
	});
});
