import { describe, expect, test } from "bun:test";
import type { PendingPermissionRequest } from "@superset/session-protocol";
import {
	createQuestionResponse,
	createUserMessage,
	parseAskUserQuestions,
} from "./sessionMessages";

const request: PendingPermissionRequest = {
	requestId: "request-1",
	toolUseID: "tool-1",
	toolName: "AskUserQuestion",
	input: {
		questions: [
			{
				question: "Which target?",
				header: "Target",
				options: [{ label: "Alpha", description: "First" }],
				multiSelect: false,
			},
		],
	},
	requestedAt: 1,
};

describe("Claude mobile session messages", () => {
	test("constructs the native SDK user message", () => {
		expect(createUserMessage("hello")).toEqual({
			type: "user",
			message: {
				role: "user",
				content: [{ type: "text", text: "hello" }],
			},
			parent_tool_use_id: null,
		});
	});

	test("parses and answers AskUserQuestion through updatedInput.answers", () => {
		expect(parseAskUserQuestions(request)).toEqual([
			{
				question: "Which target?",
				header: "Target",
				options: [{ label: "Alpha", description: "First" }],
				multiSelect: false,
			},
		]);
		expect(
			createQuestionResponse(request, { "Which target?": "Alpha" }),
		).toEqual({
			behavior: "allow",
			updatedInput: {
				...request.input,
				answers: { "Which target?": "Alpha" },
			},
			toolUseID: "tool-1",
			decisionClassification: "user_temporary",
		});
	});
});
