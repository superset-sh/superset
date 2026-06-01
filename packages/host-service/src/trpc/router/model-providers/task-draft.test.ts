import { describe, expect, it } from "bun:test";
import {
	extractTaskDraftFromGatewayResponse,
	parseTaskDraft,
} from "./task-draft-parser";

describe("task draft parsing", () => {
	it("normalizes a structured tool-use draft", () => {
		const draft = extractTaskDraftFromGatewayResponse({
			content: [
				{
					type: "tool_use",
					name: "propose_task_draft",
					input: {
						title: " Fix billing webhook retries ",
						description: "Add retry visibility.",
						priority: "high",
						labels: [" Billing ", "billing", "webhook"],
						dueDate: "2026-06-03",
					},
				},
			],
		});

		expect(draft).toEqual({
			title: "Fix billing webhook retries",
			description: "Add retry visibility.",
			priority: "high",
			labels: ["Billing", "webhook"],
			dueDate: "2026-06-03",
		});
	});

	it("parses JSON text fallback and drops invalid optional fields", () => {
		const draft = extractTaskDraftFromGatewayResponse({
			content: [
				{
					type: "text",
					text: '```json\n{"title":"Create support macro","priority":"none","labels":[" support "],"dueDate":"tomorrow"}\n```',
				},
			],
		});

		expect(draft).toEqual({
			title: "Create support macro",
			description: null,
			priority: "none",
			labels: ["support"],
			dueDate: null,
		});
	});

	it("rejects drafts without a title", () => {
		expect(() => parseTaskDraft({ description: "missing title" })).toThrow();
	});
});
