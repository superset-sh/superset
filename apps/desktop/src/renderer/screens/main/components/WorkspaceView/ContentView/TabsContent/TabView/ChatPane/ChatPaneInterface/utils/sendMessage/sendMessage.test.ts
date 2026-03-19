import { describe, expect, it, mock } from "bun:test";
import { sendMessageForSession, toSendFailureMessage } from "./sendMessage";

describe("sendMessageForSession", () => {
	it("creates a fresh session and sends to that session when no current session exists", async () => {
		const ensureSessionReady = mock(async () => true);
		const onStartFreshSession = mock(async () => ({
			created: true,
			sessionId: "session-new",
		}));
		const sendToCurrentSession = mock(async () => "current");
		const sendToSession = mock(
			async (sessionId: string) => `sent:${sessionId}`,
		);

		const result = await sendMessageForSession({
			currentSessionId: null,
			isSessionReady: false,
			ensureSessionReady,
			onStartFreshSession,
			sendToCurrentSession,
			sendToSession,
		});

		expect(result).toEqual({
			targetSessionId: "session-new",
			value: "sent:session-new",
		});
		expect(onStartFreshSession).toHaveBeenCalledTimes(1);
		expect(sendToSession).toHaveBeenCalledWith("session-new");
		expect(sendToCurrentSession).toHaveBeenCalledTimes(0);
		expect(ensureSessionReady).toHaveBeenCalledTimes(0);
	});

	it("blocks send when current session cannot be ensured", async () => {
		const ensureSessionReady = mock(async () => false);
		const onStartFreshSession = mock(async () => ({
			created: true,
			sessionId: "session-new",
		}));
		const sendToCurrentSession = mock(async () => "current");
		const sendToSession = mock(async () => "other");

		await expect(
			sendMessageForSession({
				currentSessionId: "session-current",
				isSessionReady: false,
				ensureSessionReady,
				onStartFreshSession,
				sendToCurrentSession,
				sendToSession,
			}),
		).rejects.toThrow(
			"Chat session failed to initialize. Please wait a moment and retry.",
		);

		expect(ensureSessionReady).toHaveBeenCalledTimes(1);
		expect(onStartFreshSession).toHaveBeenCalledTimes(0);
		expect(sendToCurrentSession).toHaveBeenCalledTimes(0);
		expect(sendToSession).toHaveBeenCalledTimes(0);
	});

	it("sends on the current session when it is ready", async () => {
		const ensureSessionReady = mock(async () => true);
		const onStartFreshSession = mock(async () => ({
			created: true,
			sessionId: "session-new",
		}));
		const sendToCurrentSession = mock(async () => "current");
		const sendToSession = mock(async () => "other");

		const result = await sendMessageForSession({
			currentSessionId: "session-current",
			isSessionReady: true,
			ensureSessionReady,
			onStartFreshSession,
			sendToCurrentSession,
			sendToSession,
		});

		expect(result).toEqual({
			targetSessionId: "session-current",
			value: "current",
		});
		expect(sendToCurrentSession).toHaveBeenCalledTimes(1);
		expect(sendToSession).toHaveBeenCalledTimes(0);
		expect(ensureSessionReady).toHaveBeenCalledTimes(0);
	});
});

describe("toSendFailureMessage", () => {
	it("maps auth failures when status is 401/403", () => {
		expect(toSendFailureMessage({ status: 401 })).toBe(
			"Model authentication failed. Reconnect OAuth or set an API key in the model picker, then retry.",
		);
		expect(toSendFailureMessage({ response: { status: 403 } })).toBe(
			"Model authentication failed. Reconnect OAuth or set an API key in the model picker, then retry.",
		);
	});

	it("keeps backend message when status is not auth-related", () => {
		expect(
			toSendFailureMessage(
				new Error("Unauthorized model provider token, please reconnect OAuth"),
			),
		).toBe("Unauthorized model provider token, please reconnect OAuth");
	});
});
