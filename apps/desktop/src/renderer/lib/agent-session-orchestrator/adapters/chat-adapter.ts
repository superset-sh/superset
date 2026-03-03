import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import type { AgentSessionLaunchContext, LaunchResultPayload } from "../types";

type ChatLaunchRequest = Extract<AgentLaunchRequest, { kind: "chat" }>;

type ChatClient = {
	session: {
		sendMessage: {
			mutate: (input: {
				sessionId: string;
				payload: { content: string };
				metadata?: { model?: string };
			}) => Promise<unknown>;
		};
	};
};

let chatClientPromise: Promise<ChatClient> | null = null;

async function getChatClient(): Promise<ChatClient> {
	if (!chatClientPromise) {
		chatClientPromise = import(
			"renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatMastraPane/utils/chat-mastra-service-client"
		).then((module) => module.createChatMastraServiceIpcClient());
	}
	return chatClientPromise;
}

async function defaultSendChatMessage(input: {
	sessionId: string;
	prompt: string;
	model?: string;
}) {
	const chatClient = await getChatClient();
	await chatClient.session.sendMessage.mutate({
		sessionId: input.sessionId,
		payload: { content: input.prompt },
		metadata: input.model ? { model: input.model } : undefined,
	});
}

async function sendInitialPromptWithRetry({
	context,
	sessionId,
	prompt,
	model,
	retryCount,
}: {
	context: AgentSessionLaunchContext;
	sessionId: string;
	prompt: string;
	model?: string;
	retryCount: number;
}) {
	const send = context.sendChatMessage ?? defaultSendChatMessage;
	let attempt = 0;
	let lastError: unknown;

	while (attempt <= retryCount) {
		try {
			await send({ sessionId, prompt, model });
			return;
		} catch (error) {
			lastError = error;
			attempt += 1;
			if (attempt > retryCount) {
				throw lastError;
			}
		}
	}
}

export async function launchChatAdapter(
	request: ChatLaunchRequest,
	context: AgentSessionLaunchContext,
): Promise<LaunchResultPayload> {
	const tabs = context.tabs;
	if (!tabs) {
		throw new Error("Missing tabs adapter");
	}

	let tabId: string;
	let paneId: string;

	const targetPaneId = request.chat.paneId;
	if (targetPaneId) {
		const targetPane = tabs.getPane(targetPaneId);
		if (!targetPane) {
			throw new Error(`Pane not found: ${targetPaneId}`);
		}
		const tab = tabs.getTab(targetPane.tabId);
		if (!tab || tab.workspaceId !== request.workspaceId) {
			throw new Error(`Tab not found for pane: ${targetPaneId}`);
		}

		if (targetPane.type === "chat-mastra") {
			tabId = tab.id;
			paneId = targetPane.id;
		} else {
			const created = tabs.addChatTab(request.workspaceId);
			tabId = created.tabId;
			paneId = created.paneId;
		}
	} else {
		const created = tabs.addChatTab(request.workspaceId);
		tabId = created.tabId;
		paneId = created.paneId;
	}

	tabs.setTabAutoTitle(tabId, "Superset Chat");

	const pane = tabs.getPane(paneId);
	let sessionId = request.chat.sessionId ?? pane?.chatMastra?.sessionId ?? null;
	if (!sessionId) {
		sessionId = crypto.randomUUID();
	}

	if (pane?.chatMastra?.sessionId !== sessionId) {
		tabs.switchChatSession(paneId, sessionId);
	}

	const initialPrompt = request.chat.initialPrompt?.trim();
	if (initialPrompt) {
		await sendInitialPromptWithRetry({
			context,
			sessionId,
			prompt: initialPrompt,
			model: request.chat.model,
			retryCount: request.chat.retryCount ?? 0,
		});
	}

	return {
		tabId,
		paneId,
		sessionId,
	};
}
