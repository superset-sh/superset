import type { AppRouter } from "@superset/trpc";
import type { createTRPCClient } from "@trpc/client";
import type { createMastraCode } from "mastracode";

export type RuntimeHarness = Awaited<
	ReturnType<typeof createMastraCode>
>["harness"];
export type RuntimeMcpManager = Awaited<
	ReturnType<typeof createMastraCode>
>["mcpManager"];
export type RuntimeHookManager = Awaited<
	ReturnType<typeof createMastraCode>
>["hookManager"];
export type RuntimeDisplayState = ReturnType<RuntimeHarness["getDisplayState"]>;

export interface RuntimeSession {
	sessionId: string;
	harness: RuntimeHarness;
	mcpManager: RuntimeMcpManager;
	hookManager: RuntimeHookManager;
	cwd: string;
}

type ApiClient = ReturnType<typeof createTRPCClient<AppRouter>>;

/**
 * Gate: validates user prompt against hooks before sending.
 * Throws if the hook blocks the message.
 */
export async function onUserPromptSubmit(
	runtime: RuntimeSession,
	userMessage: string,
): Promise<void> {
	if (!runtime.hookManager) return;
	const result = await runtime.hookManager.runUserPromptSubmit(userMessage);
	if (!result.allowed) {
		throw new Error(result.blockReason ?? "Blocked by UserPromptSubmit hook");
	}
}

/**
 * Subscribe to harness lifecycle events for a runtime session.
 * Call once after creating a runtime — handles stop hooks and title generation.
 */
export function subscribeToSessionEvents(
	runtime: RuntimeSession,
	apiClient: ApiClient,
): void {
	runtime.harness.subscribe((event) => {
		if (event.type === "agent_end") {
			const reason = event.reason ?? "complete";
			if (runtime.hookManager) {
				void runtime.hookManager.runStop(undefined, reason).catch(() => {});
			}
			if (reason === "complete") {
				void generateAndSetTitle(runtime, apiClient);
			}
		}
	});
}

async function generateAndSetTitle(
	runtime: RuntimeSession,
	apiClient: ApiClient,
): Promise<void> {
	try {
		const messages = await runtime.harness.listMessages();
		const userMessages = messages.filter((m) => m.role === "user");
		const userCount = userMessages.length;

		const isFirst = userCount === 1;
		const isRename = userCount > 1 && userCount % 10 === 0;
		if (!isFirst && !isRename) return;

		let text: string;
		const firstMessage = userMessages[0];
		if (isFirst && firstMessage) {
			text = firstMessage.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join(" ")
				.slice(0, 500);
		} else {
			text = messages
				.slice(-10)
				.map((m) => {
					const body = m.content
						.filter(
							(c): c is { type: "text"; text: string } => c.type === "text",
						)
						.map((c) => c.text)
						.join(" ");
					return `${m.role}: ${body}`;
				})
				.join("\n")
				.slice(0, 2000);
		}
		if (!text.trim()) return;

		const mode = runtime.harness.getCurrentMode();
		const agent =
			typeof mode.agent === "function" ? mode.agent({}) : mode.agent;

		const title = await agent.generateTitleFromUserMessage({
			message: text,
			model: runtime.harness.getFullModelId(),
			tracingContext: {},
		});
		if (!title?.trim()) return;

		await apiClient.chat.updateTitle.mutate({
			sessionId: runtime.sessionId,
			title: title.trim(),
		});
	} catch (error) {
		console.warn("[chat-mastra] Title generation failed:", error);
	}
}
