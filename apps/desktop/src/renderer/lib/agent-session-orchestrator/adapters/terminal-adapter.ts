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

async function writeAttachmentFiles(
	workspaceId: string,
	files: Array<{ data: string; mediaType: string; filename?: string }>,
): Promise<string[]> {
	const { electronTrpcClient } = await import("renderer/lib/trpc-client");
	const workspace = await electronTrpcClient.workspaces.get.query({
		id: workspaceId,
	});
	if (!workspace?.worktreePath) {
		throw new Error(`Workspace path not found: ${workspaceId}`);
	}

	const attachmentsDirectory = joinAbsolutePath(
		workspace.worktreePath,
		".superset/attachments",
	);
	await electronTrpcClient.filesystem.createDirectory.mutate({
		workspaceId,
		absolutePath: attachmentsDirectory,
	});

	const writtenPaths: string[] = [];
	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		if (!file) continue;

		// Generate a safe filename
		const timestamp = Date.now();
		const index = i + 1;
		const extension = file.filename?.split(".").pop() ?? "dat";
		const sanitizedFilename =
			file.filename?.replace(/[^a-zA-Z0-9._-]/g, "_") ??
			`attachment_${timestamp}_${index}`;
		const fileName = sanitizedFilename.endsWith(`.${extension}`)
			? sanitizedFilename
			: `${sanitizedFilename}.${extension}`;

		// Extract base64 data from data URL (format: data:mime/type;base64,DATA)
		const base64Match = file.data.match(/^data:[^;]+;base64,(.+)$/);
		if (!base64Match?.[1]) {
			throw new Error(`Invalid data URL format for file: ${fileName}`);
		}

		const absolutePath = joinAbsolutePath(attachmentsDirectory, fileName);
		await electronTrpcClient.filesystem.writeFile.mutate({
			workspaceId,
			absolutePath,
			content: { kind: "base64", data: base64Match[1] },
		});

		// Return relative path from workspace root
		writtenPaths.push(`.superset/attachments/${fileName}`);
	}

	return writtenPaths;
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

			// Write attachment files if present
			if (request.terminal.initialFiles?.length) {
				await writeAttachmentFiles(workspaceId, request.terminal.initialFiles);
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

		// Write attachment files if present
		if (request.terminal.initialFiles?.length) {
			await writeAttachmentFiles(workspaceId, request.terminal.initialFiles);
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
