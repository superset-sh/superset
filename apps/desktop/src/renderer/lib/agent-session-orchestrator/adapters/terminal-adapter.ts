import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import { launchCommandInPane } from "renderer/lib/terminal/launch-command";
import type { AgentSessionLaunchContext, LaunchResultPayload } from "../types";

type TerminalLaunchRequest = Extract<AgentLaunchRequest, { kind: "terminal" }>;

export async function launchTerminalAdapter(
	request: TerminalLaunchRequest,
	context: AgentSessionLaunchContext,
): Promise<LaunchResultPayload> {
	const tabs = context.tabs;
	if (!tabs) {
		throw new Error("Missing tabs adapter");
	}

	const { workspaceId } = request;
	const targetPaneId = request.terminal.paneId;

	const noExecute = request.terminal.autoExecute === false;

	if (targetPaneId) {
		const targetPane = tabs.getPane(targetPaneId);
		if (!targetPane) {
			throw new Error(`Pane not found: ${targetPaneId}`);
		}

		const tab = tabs.getTab(targetPane.tabId);
		if (!tab || tab.workspaceId !== workspaceId) {
			throw new Error(`Tab not found for pane: ${targetPaneId}`);
		}

		const newPaneId = tabs.addTerminalPane(tab.id);
		if (!newPaneId) {
			throw new Error("Failed to add pane");
		}

		try {
			await launchCommandInPane({
				paneId: newPaneId,
				tabId: tab.id,
				workspaceId,
				command: request.terminal.command,
				createOrAttach: context.createOrAttach,
				write: context.write,
				noExecute,
				taskPromptContent: request.terminal.taskPromptContent,
				taskPromptFileName: request.terminal.taskPromptFileName,
			});
		} catch (error) {
			tabs.removePane(newPaneId);
			throw error;
		}

		return {
			tabId: tab.id,
			paneId: newPaneId,
			sessionId: null,
		};
	}

	const { tabId, paneId } = tabs.addTerminalTab(workspaceId);
	tabs.setTabAutoTitle(tabId, request.terminal.name ?? "Agent");

	try {
		await launchCommandInPane({
			paneId,
			tabId,
			workspaceId,
			command: request.terminal.command,
			createOrAttach: context.createOrAttach,
			write: context.write,
			noExecute,
			taskPromptContent: request.terminal.taskPromptContent,
			taskPromptFileName: request.terminal.taskPromptFileName,
		});
	} catch (error) {
		tabs.removePane(paneId);
		throw error;
	}

	return {
		tabId,
		paneId,
		sessionId: null,
	};
}
