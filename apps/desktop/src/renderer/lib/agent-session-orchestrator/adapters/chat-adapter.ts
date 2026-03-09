import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import type { ChatMastraLaunchConfig } from "shared/tabs-types";
import type { AgentSessionLaunchContext, LaunchResultPayload } from "../types";

type ChatLaunchRequest = Extract<AgentLaunchRequest, { kind: "chat" }>;

function toLaunchConfig(
	request: ChatLaunchRequest,
): ChatMastraLaunchConfig | null {
	const prompt = request.chat.initialPrompt?.trim();
	const model = request.chat.model?.trim();
	const retryCount = request.chat.retryCount;
	const autoExecute = request.chat.autoExecute;
	const taskSlug = request.chat.taskSlug?.trim();

	if (!prompt && !model && retryCount === undefined && !taskSlug) {
		return null;
	}

	const isDraft = autoExecute === false;

	return {
		initialPrompt: !isDraft ? prompt || undefined : undefined,
		draftInput: isDraft && taskSlug ? `@task:${taskSlug} ` : undefined,
		metadata: model ? { model } : undefined,
		retryCount: !isDraft ? retryCount : undefined,
	};
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
	const launchConfig = toLaunchConfig(request);

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
			const nextPaneId = tabs.addChatPane(tab.id, {
				launchConfig,
			});
			tabId = tab.id;
			paneId = nextPaneId;
		}
	} else {
		const created = tabs.addChatTab(request.workspaceId, {
			launchConfig,
		});
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

	if (launchConfig) {
		tabs.setChatLaunchConfig(paneId, launchConfig);
	}

	return {
		tabId,
		paneId,
		sessionId,
	};
}
