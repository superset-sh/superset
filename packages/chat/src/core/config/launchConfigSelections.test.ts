import { expect, test } from "bun:test";
import { launchConfigSelections } from "./launchConfigSelections";

const options = [
	{
		id: "model",
		label: "Model",
		category: "model",
		currentValue: "default",
		options: [
			{ id: "default", label: "Default" },
			{ id: "claude-opus-5-5[1m]", label: "Opus" },
		],
	},
	{
		id: "effort",
		label: "Effort",
		category: "thought_level",
		currentValue: "medium",
		options: [
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
		],
	},
];

test("maps remembered CLI labels onto the agent's own option ids", () => {
	expect(
		launchConfigSelections(options, {
			modelLabel: "opus",
			effortLabel: "High",
		}),
	).toEqual([
		{ configId: "model", value: "claude-opus-5-5[1m]" },
		{ configId: "effort", value: "high" },
	]);
});

test("skips labels the agent does not offer or already uses", () => {
	expect(
		launchConfigSelections(options, {
			modelLabel: "Sonnet",
			effortLabel: "Medium",
		}),
	).toEqual([]);
});
