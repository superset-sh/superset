import { describe, expect, test } from "bun:test";
import {
	renderTaskPromptTemplate,
	validateTaskPromptTemplate,
} from "./agent-prompt-template";

const TASK = {
	id: "task-1",
	slug: "demo-task",
	title: "Demo Task",
	description: null,
	priority: "medium",
	statusName: "Todo",
	labels: ["desktop"],
};

describe("renderTaskPromptTemplate", () => {
	test("renders placeholders with surrounding whitespace", () => {
		const rendered = renderTaskPromptTemplate(
			"Task {{ title }} / {{ slug }}",
			TASK,
		);

		expect(rendered).toBe("Task Demo Task / demo-task");
	});
});

describe("validateTaskPromptTemplate", () => {
	test("accepts placeholders with surrounding whitespace", () => {
		expect(validateTaskPromptTemplate("Task {{ title }}")).toEqual({
			valid: true,
			unknownVariables: [],
		});
	});
});
