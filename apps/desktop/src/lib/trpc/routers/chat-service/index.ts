import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	createChatServiceRouter as buildRouter,
	ChatService,
} from "@superset/chat/host";
import { sessionStateSchema } from "@superset/chat/schema";
import { convertExternalSessionToChatChunks } from "@superset/chat/shared";
import { TRPCError } from "@trpc/server";
import fg from "fast-glob";
import { env } from "main/env.main";
import { appState } from "main/lib/app-state";
import { getHashedDeviceId } from "main/lib/device-info";
import { notificationsEmitter } from "main/lib/notifications/server";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { loadToken } from "../auth/utils/auth-functions";

interface ClaudeSessionSummary {
	id: string;
	title: string;
	filePath: string;
	projectId: string;
	lastModifiedAt: string;
}

type FileStat = Awaited<ReturnType<typeof stat>>;

function resolveLifecycleTargets(sessionId: string): Array<{
	paneId: string;
	tabId: string;
	workspaceId: string;
}> {
	const tabsState = appState.data.tabsState;
	if (!tabsState) return [];

	const tabWorkspaceById = new Map(
		tabsState.tabs.map((tab) => [tab.id, tab.workspaceId]),
	);
	const targets: Array<{
		paneId: string;
		tabId: string;
		workspaceId: string;
	}> = [];

	for (const [paneId, pane] of Object.entries(tabsState.panes)) {
		if (pane.type !== "chat") continue;
		if (pane.chat?.sessionId !== sessionId) continue;

		const workspaceId = tabWorkspaceById.get(pane.tabId);
		if (!workspaceId) continue;

		targets.push({
			paneId,
			tabId: pane.tabId,
			workspaceId,
		});
	}

	return targets;
}

function getClaudeProjectsRoot(): string {
	return path.join(os.homedir(), ".claude", "projects");
}

function encodeClaudeProjectPath(cwd: string): string {
	const normalized = path.resolve(cwd).replace(/\\/g, "/");
	const withoutDrive = normalized.replace(/^[A-Za-z]:/, "");
	const segments = withoutDrive
		.split("/")
		.filter(Boolean)
		.map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, "-"));
	return `-${segments.join("-")}`;
}

function isWithinDirectory(rootDir: string, targetPath: string): boolean {
	const relative = path.relative(rootDir, targetPath);
	return (
		relative.length > 0 &&
		!relative.startsWith("..") &&
		!path.isAbsolute(relative)
	);
}

async function listClaudeSessions(args: {
	cwd: string;
	limit: number;
}): Promise<ClaudeSessionSummary[]> {
	const { cwd, limit } = args;
	const claudeProjectsRoot = getClaudeProjectsRoot();
	if (!existsSync(claudeProjectsRoot)) return [];

	const filePaths = await fg("**/*.jsonl", {
		cwd: claudeProjectsRoot,
		absolute: true,
		onlyFiles: true,
		unique: true,
		followSymbolicLinks: false,
		suppressErrors: true,
	});

	const workspaceProjectId = encodeClaudeProjectPath(cwd);
	const workspaceMatches = filePaths.filter((filePath) => {
		const relative = path
			.relative(claudeProjectsRoot, filePath)
			.replace(/\\/g, "/");
		const [projectId] = relative.split("/");
		return projectId === workspaceProjectId;
	});

	const candidates = workspaceMatches.length > 0 ? workspaceMatches : filePaths;

	const withStats: Array<{ filePath: string; fileStat: FileStat }> = [];
	for (const filePath of candidates) {
		try {
			const fileStat = await stat(filePath);
			withStats.push({ filePath, fileStat });
		} catch {}
	}

	return withStats
		.sort((a, b) => b.fileStat.mtime.getTime() - a.fileStat.mtime.getTime())
		.slice(0, limit)
		.map(({ filePath, fileStat }) => {
			const relative = path
				.relative(claudeProjectsRoot, filePath)
				.replace(/\\/g, "/");
			const [projectId = "unknown"] = relative.split("/");
			const id = path.basename(filePath, ".jsonl");
			return {
				id,
				title: id,
				filePath,
				projectId,
				lastModifiedAt: fileStat.mtime.toISOString(),
			};
		});
}

function getMessageTextFromChunk(
	chunk: ReturnType<
		typeof convertExternalSessionToChatChunks
	>["messages"][number],
): string {
	for (const part of chunk.message.parts) {
		if (part.type === "text" && typeof part.text === "string") {
			return part.text.trim();
		}
	}
	return "";
}

function deriveImportedSessionTitle(args: {
	filePath: string;
	messages: ReturnType<typeof convertExternalSessionToChatChunks>["messages"];
}): string {
	const { filePath, messages } = args;
	const firstUserText = messages
		.filter((message) => message.message.role === "user")
		.map(getMessageTextFromChunk)
		.find((text) => text.length > 0);
	if (firstUserText) {
		return firstUserText.slice(0, 120);
	}
	return path.basename(filePath, ".jsonl");
}

async function getAuthHeaders(): Promise<Record<string, string>> {
	const { token } = await loadToken();
	if (!token) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You must be signed in to import Claude sessions",
		});
	}
	return {
		Authorization: `Bearer ${token}`,
	};
}

async function importClaudeSession(args: {
	filePath: string;
	organizationId: string;
	workspaceId: string;
}): Promise<{
	sessionId: string;
	title: string;
	importedMessages: number;
	ignoredEntries: number;
}> {
	const claudeProjectsRoot = getClaudeProjectsRoot();
	const normalizedFilePath = path.resolve(args.filePath);
	if (!existsSync(claudeProjectsRoot)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Claude projects directory does not exist",
		});
	}
	if (!isWithinDirectory(claudeProjectsRoot, normalizedFilePath)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid Claude session path",
		});
	}
	if (!normalizedFilePath.endsWith(".jsonl")) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Claude session file must be .jsonl",
		});
	}

	const sessionFileContent = await readFile(normalizedFilePath, "utf8");
	const converted = convertExternalSessionToChatChunks({
		input: sessionFileContent,
		providerId: "claude-code",
	});
	if (converted.messages.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "No importable messages found in Claude session",
		});
	}

	const headers = await getAuthHeaders();
	const sessionId = randomUUID();
	const createResponse = await fetch(
		`${env.NEXT_PUBLIC_API_URL}/api/chat/${sessionId}`,
		{
			method: "PUT",
			headers: {
				...headers,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				organizationId: args.organizationId,
				workspaceId: args.workspaceId,
			}),
		},
	);
	if (!createResponse.ok) {
		const detail = await createResponse.text().catch(() => "");
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to create imported session (${createResponse.status}): ${detail || "unknown error"}`,
		});
	}

	const usedMessageIds = new Set<string>();
	let seqCounter = 0;
	for (const [index, chunk] of converted.messages.entries()) {
		const baseMessageId =
			typeof chunk.message.id === "string" && chunk.message.id.trim().length > 0
				? chunk.message.id.trim()
				: `imported-${index}`;
		let messageId = baseMessageId;
		let duplicateCounter = 1;
		while (usedMessageIds.has(messageId)) {
			messageId = `${baseMessageId}-${duplicateCounter++}`;
		}
		usedMessageIds.add(messageId);

		const createdAtRaw = chunk.message.createdAt;
		const createdAt =
			typeof createdAtRaw === "string"
				? createdAtRaw
				: createdAtRaw instanceof Date
					? createdAtRaw.toISOString()
					: new Date().toISOString();
		const role = chunk.message.role;
		const actorId =
			role === "user"
				? "imported-claude-user"
				: role === "assistant"
					? "imported-claude-assistant"
					: "imported-claude-system";

		const event = sessionStateSchema.chunks.insert({
			key: `${messageId}:0`,
			value: {
				messageId,
				actorId,
				role,
				chunk: JSON.stringify({
					type: "whole-message",
					message: {
						...chunk.message,
						id: messageId,
						createdAt,
					},
				}),
				seq: seqCounter++,
				createdAt,
			},
		});

		const appendResponse = await fetch(
			`${env.NEXT_PUBLIC_API_URL}/api/chat/${sessionId}/stream`,
			{
				method: "POST",
				headers: {
					...headers,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(event),
			},
		);
		if (!appendResponse.ok) {
			const detail = await appendResponse.text().catch(() => "");
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to append imported message (${appendResponse.status}): ${detail || "unknown error"}`,
			});
		}
	}

	const title = deriveImportedSessionTitle({
		filePath: normalizedFilePath,
		messages: converted.messages,
	});
	if (title.trim().length > 0) {
		await fetch(`${env.NEXT_PUBLIC_API_URL}/api/chat/${sessionId}`, {
			method: "PATCH",
			headers: {
				...headers,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ title: title.trim() }),
		}).catch(() => {});
	}

	return {
		sessionId,
		title,
		importedMessages: converted.messages.length,
		ignoredEntries: converted.ignoredEntries,
	};
}

const service = new ChatService({
	deviceId: getHashedDeviceId(),
	apiUrl: env.NEXT_PUBLIC_API_URL,
	getHeaders: async () => {
		const { token } = await loadToken();
		const headers: Record<string, string> = {};
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}
		return headers;
	},
	onLifecycleEvent: ({ sessionId, eventType }) => {
		const targets = resolveLifecycleTargets(sessionId);
		if (targets.length === 0) return;

		for (const target of targets) {
			notificationsEmitter.emit(NOTIFICATION_EVENTS.AGENT_LIFECYCLE, {
				...target,
				eventType,
			});
		}
	},
});

export const createChatServiceRouter = () => buildRouter(service);

export const createChatServiceClaudeRouter = () =>
	router({
		listSessions: publicProcedure
			.input(
				z.object({
					cwd: z.string().min(1),
					limit: z.number().int().min(1).max(200).default(30),
				}),
			)
			.query(async ({ input }) => {
				return listClaudeSessions({
					cwd: input.cwd,
					limit: input.limit,
				});
			}),
		importSession: publicProcedure
			.input(
				z.object({
					filePath: z.string().min(1),
					organizationId: z.string().min(1),
					workspaceId: z.string().min(1),
				}),
			)
			.mutation(async ({ input }) => {
				return importClaudeSession({
					filePath: input.filePath,
					organizationId: input.organizationId,
					workspaceId: input.workspaceId,
				});
			}),
	});

export type ChatServiceDesktopRouter = ReturnType<
	typeof createChatServiceRouter
>;
