import { describe, expect, test } from "bun:test";
import {
	AGENT_DEFAULT_OPTION_ID,
	launchConfigOptions,
	launchOptionValue,
} from "./launchConfigOptions";

const labels = {
	model: "Model",
	defaultModel: "Default model",
	effort: "Effort",
	defaultEffort: "Default effort",
	mode: "Mode",
	directMode: "Direct",
};

describe("launchConfigOptions", () => {
	test("maps the catalog onto the picker's categories with a default first", () => {
		const options = launchConfigOptions({
			modelSupport: {
				presetId: "claude",
				modelFlag: "--model",
				models: [{ id: "opus", label: "Opus", group: "Latest" }],
			},
			selectedModel: "opus",
			efforts: [
				{ id: "low", label: "Low" },
				{ id: "high", label: "High" },
			],
			selectedEffort: null,
			modeSupport: {
				presetId: "omp",
				modes: [{ id: "plan", label: "Plan first", args: ["--plan-yolo"] }],
			},
			selectedMode: "plan",
			labels,
		});
		expect(options.map((option) => option.category)).toEqual([
			"model",
			"thought_level",
			"launch_mode",
		]);
		expect(options[0]?.currentValue).toBe("opus");
		expect(options[0]?.options.map((entry) => entry.id)).toEqual([
			AGENT_DEFAULT_OPTION_ID,
			"opus",
		]);
		expect(options[1]?.currentValue).toBe(AGENT_DEFAULT_OPTION_ID);
		expect(options[2]?.currentValue).toBe("plan");
	});

	test("a remembered pick the catalog no longer offers shows as the default", () => {
		const [effort] = launchConfigOptions({
			modelSupport: undefined,
			selectedModel: null,
			efforts: [{ id: "low", label: "Low" }],
			selectedEffort: "xhigh",
			modeSupport: undefined,
			selectedMode: null,
			labels,
		});
		expect(effort?.currentValue).toBe(AGENT_DEFAULT_OPTION_ID);
	});

	test("omits what the agent has no catalog for", () => {
		expect(
			launchConfigOptions({
				modelSupport: undefined,
				selectedModel: null,
				efforts: [],
				selectedEffort: null,
				modeSupport: undefined,
				selectedMode: null,
				labels,
			}),
		).toEqual([]);
	});

	test("the default option reads back as null", () => {
		expect(launchOptionValue(AGENT_DEFAULT_OPTION_ID)).toBeNull();
		expect(launchOptionValue("opus")).toBe("opus");
	});
});
