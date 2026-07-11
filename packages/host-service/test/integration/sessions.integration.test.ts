import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { TRPCClientError } from "@trpc/client";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

describe("sessions router integration with stub ClaudeSessionManager", () => {
	let host: TestHost;
	const calls: Array<{ method: string; args: unknown }> = [];
	const sessionId = randomUUID();

	const stubSessions = {
		sendMessage: (input: unknown) => {
			calls.push({ method: "sendMessage", args: input });
			return { accepted: true as const };
		},
		dispose: async () => {},
	};

	beforeEach(async () => {
		calls.length = 0;
		host = await createTestHost({
			sessions: stubSessions,
		});
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("sendMessage remains entirely host-local", async () => {
		const message = {
			type: "user" as const,
			message: { role: "user" as const, content: "hello" },
			parent_tool_use_id: null,
		};
		expect(
			await host.trpc.sessions.sendMessage.mutate({ sessionId, message }),
		).toEqual({ accepted: true });
		expect(calls).toEqual([
			{ method: "sendMessage", args: { sessionId, message } },
		]);

		expect(
			host.apiCalls.some((call) => call.path === "chat.updateSession.mutate"),
		).toBe(false);
	});

	test("sendMessage requires host authentication", async () => {
		await expect(
			host.unauthenticatedTrpc.sessions.sendMessage.mutate({
				sessionId,
				message: {
					type: "user",
					message: { role: "user", content: "hello" },
					parent_tool_use_id: null,
				},
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});
});
