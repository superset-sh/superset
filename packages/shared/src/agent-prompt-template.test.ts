import { describe, expect, test } from "bun:test";
import {
	AGENT_CONTEXT_PROMPT_VARIABLES,
	DEFAULT_CONTEXT_PROMPT_TEMPLATE_SYSTEM,
	DEFAULT_CONTEXT_PROMPT_TEMPLATE_USER,
	getSupportedContextPromptVariables,
	renderPromptTemplate,
	renderTaskPromptTemplate,
	validateContextPromptTemplate,
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

describe("renderTaskPromptTemplate (shim)", () => {
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

describe("renderPromptTemplate (generic)", () => {
	test("substitutes from a Record<string, string>", () => {
		const rendered = renderPromptTemplate("Hello {{name}}, age {{age}}", {
			name: "kiet",
			age: "98",
		});
		expect(rendered).toBe("Hello kiet, age 98");
	});

	test("tolerates whitespace inside braces", () => {
		expect(
			renderPromptTemplate("{{ foo }} {{  bar  }}", { foo: "a", bar: "b" }),
		).toBe("a b");
	});

	test("leaves unknown placeholders intact", () => {
		expect(renderPromptTemplate("Hi {{unknown}}", { name: "x" })).toBe(
			"Hi {{unknown}}",
		);
	});

	test("empty string values substitute (not treated as missing)", () => {
		expect(renderPromptTemplate("[{{x}}]", { x: "" })).toBe("[]");
	});

	test("collapses 3+ consecutive newlines to 2", () => {
		expect(renderPromptTemplate("a\n\n\n\nb", {})).toBe("a\n\nb");
	});

	test("trims leading and trailing whitespace", () => {
		expect(renderPromptTemplate("  hi  ", {})).toBe("hi");
	});
});

describe("context prompt variables", () => {
	test("AGENT_CONTEXT_PROMPT_VARIABLES covers launch sources", () => {
		expect(AGENT_CONTEXT_PROMPT_VARIABLES).toEqual([
			"userPrompt",
			"tasks",
			"issues",
			"prs",
			"attachments",
		]);
	});

	test("getSupportedContextPromptVariables returns a copy", () => {
		const vars = getSupportedContextPromptVariables();
		expect(vars).toEqual([...AGENT_CONTEXT_PROMPT_VARIABLES]);
		vars.push("mutated" as never);
		expect(AGENT_CONTEXT_PROMPT_VARIABLES).toHaveLength(5);
	});
});

describe("validateContextPromptTemplate", () => {
	test("accepts templates with only known variables", () => {
		expect(validateContextPromptTemplate("{{userPrompt}} {{issues}}")).toEqual({
			valid: true,
			unknownVariables: [],
		});
	});

	test("flags unknown variables", () => {
		expect(validateContextPromptTemplate("{{slackThread}} {{issues}}")).toEqual(
			{
				valid: false,
				unknownVariables: ["slackThread"],
			},
		);
	});
});

describe("default context templates", () => {
	test("markdown defaults only reference known variables", () => {
		expect(
			validateContextPromptTemplate(DEFAULT_CONTEXT_PROMPT_TEMPLATE_USER).valid,
		).toBe(true);
		expect(
			validateContextPromptTemplate(DEFAULT_CONTEXT_PROMPT_TEMPLATE_SYSTEM)
				.valid,
		).toBe(true);
	});

	test("rendering the user template collapses empty sections cleanly", () => {
		const rendered = renderPromptTemplate(
			DEFAULT_CONTEXT_PROMPT_TEMPLATE_USER,
			{
				userPrompt: "refactor auth",
				tasks: "",
				issues: "",
				prs: "",
				attachments: "",
			},
		);
		expect(rendered).toBe("refactor auth");
	});
});
