import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import { launchCommandInPane } from "renderer/lib/terminal/launch-command";
import type { AgentSessionLaunchContext, LaunchResultPayload } from "../types";

type TerminalLaunchRequest = Extract<AgentLaunchRequest, { kind: "terminal" }>;

function joinAbsolutePath(parentAbsolutePath: string, name: string): string {
	const separator = parentAbsolutePath.includes("\\") ? "\\" : "/";
	return `${parentAbsolutePath.replace(/[\\/]+$/, "")}${separator}${name}`;
}

async function writeTaskPromptFile(
	workspaceId: string,
	fileName: string,
	content: string,
): Promise<void> {
	const baseName = fileName.split(/[/\\]/).pop() ?? fileName;
	if (!baseName || baseName !== fileName || fileName.includes("..")) {
		throw new Error(`Invalid task file name: ${fileName}`);
	}

	const { electronTrpcClient } = await import("renderer/lib/trpc-client");
	const workspace = await electronTrpcClient.workspaces.get.query({
		id: workspaceId,
	});
	if (!workspace?.worktreePath) {
		throw new Error(`Workspace path not found: ${workspaceId}`);
	}

	const supersetDirectory = joinAbsolutePath(
		workspace.worktreePath,
		".superset",
	);
	await electronTrpcClient.filesystem.createDirectory.mutate({
		workspaceId,
		absolutePath: supersetDirectory,
	});
	await electronTrpcClient.filesystem.writeFile.mutate({
		workspaceId,
		absolutePath: joinAbsolutePath(supersetDirectory, baseName),
		content,
		encoding: "utf-8",
	});
}

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
			if (
				request.terminal.taskPromptContent &&
				request.terminal.taskPromptFileName
			) {
				await writeTaskPromptFile(
					workspaceId,
					request.terminal.taskPromptFileName,
					request.terminal.taskPromptContent,
				);
			}

			await launchCommandInPane({
				paneId: newPaneId,
				tabId: tab.id,
				workspaceId,
				command: request.terminal.command,
				createOrAttach: context.createOrAttach,
				write: context.write,
				noExecute,
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
		if (
			request.terminal.taskPromptContent &&
			request.terminal.taskPromptFileName
		) {
			await writeTaskPromptFile(
				workspaceId,
				request.terminal.taskPromptFileName,
				request.terminal.taskPromptContent,
			);
		}

		await launchCommandInPane({
			paneId,
			tabId,
			workspaceId,
			command: request.terminal.command,
			createOrAttach: context.createOrAttach,
			write: context.write,
			noExecute,
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
