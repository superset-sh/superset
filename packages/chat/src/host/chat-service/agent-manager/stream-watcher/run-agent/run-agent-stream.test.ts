import { describe, expect, it, mock, spyOn } from "bun:test";
import type { UIMessageChunk } from "ai";
import type { SessionHost } from "../session-host";
import {
	ANTHROPIC_OAUTH_REAUTH_REQUIRED_ERROR_CODE,
	ANTHROPIC_OAUTH_REAUTH_REQUIRED_MESSAGE,
	AnthropicOAuthReauthRequiredError,
} from "./oauth-retry";
import {
	buildRunAgentErrorChunk,
	logRunAgentFailure,
	prependRunMetadata,
	writeErrorChunkBestEffort,
} from "./run-agent-stream";

async function collectChunks(
	stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessageChunk[]> {
	const reader = stream.getReader();
	const chunks: UIMessageChunk[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			return chunks;
		}
		chunks.push(value as UIMessageChunk);
	}
}

describe("buildRunAgentErrorChunk", () => {
	it("builds a standard error chunk for generic errors", () => {
		const chunk = buildRunAgentErrorChunk(new Error("boom")) as {
			type: string;
			errorText?: string;
			code?: string;
		};

		expect(chunk.type).toBe("error");
		expect(chunk.errorText).toBe("boom");
		expect(chunk.code).toBeUndefined();
	});

	it("builds oauth reauth chunk with code and canonical text", () => {
		const chunk = buildRunAgentErrorChunk(
			new AnthropicOAuthReauthRequiredError(),
		) as {
			type: string;
			errorText?: string;
			code?: string;
		};

		expect(chunk.type).toBe("error");
		expect(chunk.errorText).toBe(ANTHROPIC_OAUTH_REAUTH_REQUIRED_MESSAGE);
		expect(chunk.code).toBe(ANTHROPIC_OAUTH_REAUTH_REQUIRED_ERROR_CODE);
	});
});

describe("prependRunMetadata", () => {
	it("prepends message-metadata runId before original chunks", async () => {
		const input = new ReadableStream<UIMessageChunk>({
			start(controller) {
				controller.enqueue({ type: "start" } as UIMessageChunk);
				controller.enqueue({
					type: "text-delta",
					id: "text-1",
					delta: "hello",
				} as UIMessageChunk);
				controller.close();
			},
		});

		const output = prependRunMetadata(input, "run-123");
		const chunks = await collectChunks(output);
		const metadata = chunks[0] as {
			type: string;
			messageMetadata?: { runId?: string };
		};

		expect(metadata.type).toBe("message-metadata");
		expect(metadata.messageMetadata?.runId).toBe("run-123");
		expect(chunks[1]).toEqual({ type: "start" });
		expect(chunks[2]).toEqual({
			type: "text-delta",
			id: "text-1",
			delta: "hello",
		});
	});
});

describe("writeErrorChunkBestEffort", () => {
	it("swallows host write failures", async () => {
		const host = {
			writeStream: mock(async () => {
				throw new Error("disk full");
			}),
		};

		await expect(
			writeErrorChunkBestEffort(
				host as unknown as SessionHost,
				new Error("boom"),
			),
		).resolves.toBeUndefined();
	});
});

describe("logRunAgentFailure", () => {
	it("logs with context when provided", () => {
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});

		try {
			logRunAgentFailure({
				sessionId: "session-1",
				scope: "Tool output continue error",
				error: new Error("boom"),
				context: { toolCallId: "call-1" },
			});

			expect(errorSpy).toHaveBeenCalledWith(
				"[run-agent] Tool output continue error for session-1:",
				expect.any(Error),
				{ toolCallId: "call-1" },
			);
		} finally {
			errorSpy.mockRestore();
		}
	});

	it("logs without context when omitted", () => {
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});

		try {
			logRunAgentFailure({
				sessionId: "session-2",
				scope: "Resume error",
				error: new Error("boom"),
			});

			expect(errorSpy).toHaveBeenCalledWith(
				"[run-agent] Resume error for session-2:",
				expect.any(Error),
			);
		} finally {
			errorSpy.mockRestore();
		}
	});
});
