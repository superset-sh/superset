import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";

const model = { id: "small-model" };
const rawGeneratedNames = {
	title: "Project Overview!!! ",
	branchName: " Project Overview?! ",
};
const sanitizedNames = {
	title: "Project Overview",
	branchName: "project-overview",
};

interface GenerateOptions {
	structuredOutput: {
		schema: z.ZodType;
		jsonPromptInjection?: boolean;
	};
}

interface AgentOptions {
	instructions: string;
}

const generateMock = mock(
	async (_prompt: string, _options: GenerateOptions) => ({
		object: rawGeneratedNames,
	}),
);
const agentConstructorMock = mock((_options: AgentOptions) => ({
	generate: generateMock,
}));
const getSmallModelMock = mock(async () => model);

mock.module("@mastra/core/agent", () => ({
	Agent: agentConstructorMock,
}));

mock.module("@superset/chat/server/shared", () => ({
	getSmallModel: getSmallModelMock,
}));

const { generateWorkspaceNamesFromPrompt } = await import(
	"./ai-workspace-names"
);

describe("generateWorkspaceNamesFromPrompt", () => {
	beforeEach(() => {
		agentConstructorMock.mockClear();
		generateMock.mockClear();
		getSmallModelMock.mockClear();
	});

	test("uses native structured output and tells the model to name vague tasks", async () => {
		await expect(
			generateWorkspaceNamesFromPrompt("whats this projec about"),
		).resolves.toEqual(sanitizedNames);

		expect(agentConstructorMock).toHaveBeenCalledTimes(1);
		const agentCall = agentConstructorMock.mock.calls[0];
		if (!agentCall) throw new Error("Agent constructor was not called");
		const [agentOptions] = agentCall;
		expect(agentOptions.instructions).toContain(
			"do not answer the prompt, ask questions, or request more context",
		);

		expect(generateMock).toHaveBeenCalledTimes(1);
		const generateCall = generateMock.mock.calls[0];
		if (!generateCall) throw new Error("Agent generate was not called");
		const [, generateOptions] = generateCall;
		const { schema } = generateOptions.structuredOutput;
		expect(schema).toBeDefined();
		expect(generateOptions.structuredOutput).not.toHaveProperty(
			"jsonPromptInjection",
		);
		expect(z.toJSONSchema(schema)).toMatchObject({
			type: "object",
			properties: {
				title: { type: "string" },
				branchName: { type: "string" },
			},
		});
	});
});

afterAll(() => {
	mock.restore();
});
