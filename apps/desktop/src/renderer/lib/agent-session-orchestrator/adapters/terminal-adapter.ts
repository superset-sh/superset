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

// Attachment limits to prevent memory/disk exhaustion
const MAX_ATTACHMENTS = 10;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200MB total decoded size
const MAX_SINGLE_FILE_BYTES = 50 * 1024 * 1024; // 50MB per file

async function writeAttachmentFiles(
	workspaceId: string,
	files: Array<{ data: string; mediaType: string; filename?: string }>,
): Promise<string[]> {
	// Enforce attachment count limit
	if (files.length > MAX_ATTACHMENTS) {
		throw new Error(
			`Too many attachments: ${files.length} files (max ${MAX_ATTACHMENTS})`,
		);
	}

	// Validate and parse files in a single pass (cache base64 data for processing)
	type ParsedFile = {
		file: (typeof files)[number];
		base64Data: string;
		decodedBytes: number;
	};
	const parsedFiles: ParsedFile[] = [];
	let totalBytes = 0;

	for (const file of files) {
		const base64Match = file.data.match(/^data:[^;]+;base64,(.+)$/);
		if (!base64Match?.[1]) {
			throw new Error(
				`Invalid data URL format for file: ${file.filename ?? "unknown"}`,
			);
		}

		// Base64 encodes 3 bytes as 4 characters, so decoded size is ~3/4 of base64 length
		const decodedBytes = Math.ceil((base64Match[1].length * 3) / 4);

		if (decodedBytes > MAX_SINGLE_FILE_BYTES) {
			throw new Error(
				`File too large: ${file.filename ?? "unknown"} is ${(decodedBytes / 1024 / 1024).toFixed(1)}MB (max ${MAX_SINGLE_FILE_BYTES / 1024 / 1024}MB)`,
			);
		}

		totalBytes += decodedBytes;
		parsedFiles.push({
			file,
			base64Data: base64Match[1],
			decodedBytes,
		});
	}

	if (totalBytes > MAX_TOTAL_BYTES) {
		throw new Error(
			`Total attachments size too large: ${(totalBytes / 1024 / 1024).toFixed(1)}MB (max ${MAX_TOTAL_BYTES / 1024 / 1024}MB)`,
		);
	}

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

	// Track all used filenames to prevent collisions (includes user and generated names)
	const usedFilenames = new Set<string>();
	const writtenPaths: string[] = [];

	for (let i = 0; i < parsedFiles.length; i++) {
		const { file, base64Data } = parsedFiles[i];
		if (!file) continue;

		// Generate unique filename
		let fileName: string;

		if (!file.filename) {
			// Generated names: find next available attachment_N
			let index = i + 1;
			do {
				fileName = `attachment_${index}`;
				index++;
			} while (usedFilenames.has(fileName));
		} else {
			// Sanitize filename
			const sanitized = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");

			// Handle empty sanitized filename (e.g., "!!!" becomes "")
			if (!sanitized.trim()) {
				let index = i + 1;
				do {
					fileName = `attachment_${index}`;
					index++;
				} while (usedFilenames.has(fileName));
			} else if (usedFilenames.has(sanitized)) {
				// Find unique name by appending _1, _2, etc. if needed
				const parts = sanitized.split(".");
				const ext = parts.length > 1 ? parts.pop() : undefined;
				const base = parts.join(".");

				let counter = 1;
				do {
					fileName = ext
						? `${base}_${counter}.${ext}`
						: `${sanitized}_${counter}`;
					counter++;
				} while (usedFilenames.has(fileName));
			} else {
				fileName = sanitized;
			}
		}

		usedFilenames.add(fileName);

		const absolutePath = joinAbsolutePath(attachmentsDirectory, fileName);
		await electronTrpcClient.filesystem.writeFile.mutate({
			workspaceId,
			absolutePath,
			content: { kind: "base64", data: base64Data },
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
