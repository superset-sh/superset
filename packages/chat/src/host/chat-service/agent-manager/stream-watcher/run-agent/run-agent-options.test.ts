import { describe, expect, it } from "bun:test";
import {
	buildAgentCallOptions,
	buildRequestEntries,
	buildResumeData,
	buildStreamInput,
	buildThinkingProviderOptions,
	DEFAULT_AGENT_MAX_STEPS,
	isToolApprovalRequired,
	normalizeToolCallId,
} from "./run-agent-options";

describe("buildRequestEntries", () => {
	it("builds required entries", () => {
		const entries = buildRequestEntries({
			modelId: "anthropic/claude-sonnet-4-6",
			cwd: "/tmp/repo",
			apiUrl: "https://api.example.com",
		});

		expect(entries).toEqual([
			["modelId", "anthropic/claude-sonnet-4-6"],
			["cwd", "/tmp/repo"],
			["apiUrl", "https://api.example.com"],
		]);
	});

	it("adds auth headers and thinking entries when present", () => {
		const entries = buildRequestEntries({
			modelId: "anthropic/claude-sonnet-4-6",
			cwd: "/tmp/repo",
			apiUrl: "https://api.example.com",
			authHeaders: { Authorization: "Bearer token" },
			thinkingEnabled: true,
		});

		expect(entries).toEqual([
			["modelId", "anthropic/claude-sonnet-4-6"],
			["cwd", "/tmp/repo"],
			["apiUrl", "https://api.example.com"],
			["authHeaders", JSON.stringify({ Authorization: "Bearer token" })],
			["thinkingEnabled", "true"],
		]);
	});
});

describe("buildStreamInput", () => {
	it("returns plain text when no file parts are present", () => {
		const streamInput = buildStreamInput("hello");
		expect(streamInput).toBe("hello");
	});

	it("builds multimodal content when file parts are present", () => {
		const streamInput = buildStreamInput("look", {
			id: "msg-1",
			role: "user",
			parts: [
				{
					type: "file",
					url: "https://cdn.example.com/image.png",
					mediaType: "image/png",
					filename: "image.png",
				},
				{
					type: "file",
					url: "https://cdn.example.com/doc.pdf",
					mediaType: "application/pdf",
					filename: "doc.pdf",
				},
			],
		});

		if (typeof streamInput === "string") {
			throw new Error("Expected multimodal stream input");
		}

		expect(streamInput.role).toBe("user");
		expect(streamInput.content).toHaveLength(3);
		expect(streamInput.content[0]).toEqual({ type: "text", text: "look" });
		expect(streamInput.content[1]).toEqual({
			type: "image",
			image: new URL("https://cdn.example.com/image.png"),
			mimeType: "image/png",
		});
		expect(streamInput.content[2]).toEqual({
			type: "file",
			data: new URL("https://cdn.example.com/doc.pdf"),
			mimeType: "application/pdf",
		});
	});
});

describe("isToolApprovalRequired", () => {
	it("returns true for approval-required modes", () => {
		expect(isToolApprovalRequired("default")).toBe(true);
		expect(isToolApprovalRequired("acceptEdits")).toBe(true);
	});

	it("returns false for other modes", () => {
		expect(isToolApprovalRequired("bypassPermissions")).toBe(false);
		expect(isToolApprovalRequired(undefined)).toBe(false);
	});
});

describe("buildThinkingProviderOptions", () => {
	it("returns undefined when thinking is disabled", () => {
		expect(buildThinkingProviderOptions(false)).toBeUndefined();
		expect(buildThinkingProviderOptions(undefined)).toBeUndefined();
	});

	it("returns anthropic thinking options when enabled", () => {
		expect(buildThinkingProviderOptions(true)).toEqual({
			anthropic: {
				thinking: {
					type: "enabled",
					budgetTokens: 10_000,
				},
			},
		});
	});
});

describe("normalizeToolCallId", () => {
	it("strips leading dashes and surrounding spaces", () => {
		expect(normalizeToolCallId("  ---abc123 ")).toBe("abc123");
	});

	it("falls back to original value when normalization is empty", () => {
		expect(normalizeToolCallId("---")).toBe("---");
	});
});

describe("buildResumeData", () => {
	it("returns empty answers on output-error state", () => {
		expect(buildResumeData("output-error", { answers: { a: "1" } })).toEqual({
			answers: {},
		});
	});

	it("returns answers when output has valid answers object", () => {
		expect(
			buildResumeData("output-available", { answers: { foo: "bar" } }),
		).toEqual({ answers: { foo: "bar" } });
	});

	it("returns empty answers when output is not an answers object", () => {
		expect(buildResumeData("output-available", { answers: null })).toEqual({
			answers: {},
		});
		expect(buildResumeData("output-available", "nope")).toEqual({
			answers: {},
		});
	});
});

describe("buildAgentCallOptions", () => {
	it("builds shared stream options with approval + thinking", () => {
		const requestContext = { requestId: "ctx-1" };
		const abortController = new AbortController();

		const options = buildAgentCallOptions({
			requestContext,
			sessionId: "session-1",
			abortSignal: abortController.signal,
			permissionMode: "default",
			thinkingEnabled: true,
		});

		expect(options).toEqual({
			requestContext,
			maxSteps: DEFAULT_AGENT_MAX_STEPS,
			memory: {
				thread: "session-1",
				resource: "session-1",
			},
			abortSignal: abortController.signal,
			requireToolApproval: true,
			providerOptions: {
				anthropic: {
					thinking: {
						type: "enabled",
						budgetTokens: 10_000,
					},
				},
			},
		});
	});

	it("omits optional fields when not needed", () => {
		const requestContext = { requestId: "ctx-2" };
		const abortController = new AbortController();

		const options = buildAgentCallOptions({
			requestContext,
			sessionId: "session-2",
			abortSignal: abortController.signal,
			permissionMode: "bypassPermissions",
			thinkingEnabled: false,
		});

		expect(options).toEqual({
			requestContext,
			maxSteps: DEFAULT_AGENT_MAX_STEPS,
			memory: {
				thread: "session-2",
				resource: "session-2",
			},
			abortSignal: abortController.signal,
		});
	});
});
