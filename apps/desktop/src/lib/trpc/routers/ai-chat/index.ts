import { exec } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import {
	memory,
	RequestContext,
	setAnthropicAuthToken,
	superagent,
	toAISdkStream,
	toAISdkV5Messages,
} from "@superset/agent";
import { env } from "main/env.main";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	getCredentialsFromConfig,
	getCredentialsFromKeychain,
} from "./utils/auth/auth";
import {
	readClaudeSessionMessages,
	scanClaudeSessions,
} from "./utils/claude-session-scanner";
import { getAvailableModels } from "./utils/models";
import {
	ensureProxySession,
	writeAgentStream,
} from "./utils/write-stream-to-proxy";

const cliCredentials =
	getCredentialsFromConfig() ?? getCredentialsFromKeychain();
if (cliCredentials?.kind === "oauth") {
	setAnthropicAuthToken(cliCredentials.apiKey);
	console.log(
		`[ai-chat] Using Claude OAuth credentials from ${cliCredentials.source} (Bearer auth)`,
	);
} else if (cliCredentials) {
	console.warn(
		`[ai-chat] Ignoring non-OAuth credentials from ${cliCredentials.source} — only OAuth is supported`,
	);
}

interface SessionContext {
	cwd: string;
	modelId: string;
	permissionMode?: string;
	requestEntries: [string, string][];
}

const sessionAbortControllers = new Map<string, AbortController>();
const sessionRunIds = new Map<string, string>();
const sessionContext = new Map<string, SessionContext>();

async function writeToDurableStream(
	stream: Parameters<typeof toAISdkStream>[0],
	sessionId: string,
	abortSignal: AbortSignal,
) {
	const messageId = crypto.randomUUID();
	await ensureProxySession(sessionId);
	const aiStream = toAISdkStream(stream, { from: "agent" });
	await writeAgentStream(aiStream as unknown as ReadableStream, {
		sessionId,
		messageId,
		abortSignal,
	});
}

function safeReadFile(path: string, maxBytes = 8_000): string | null {
	try {
		if (!existsSync(path)) return null;
		const stat = statSync(path);
		if (!stat.isFile() || stat.size > maxBytes) return null;
		return readFileSync(path, "utf-8");
	} catch {
		return null;
	}
}

const execAsync = promisify(exec);

async function safeExec(
	cmd: string,
	cwd: string,
	timeoutMs = 3_000,
): Promise<string> {
	try {
		const { stdout } = await execAsync(cmd, { cwd, timeout: timeoutMs });
		return stdout.trim();
	} catch {
		return "";
	}
}

function buildFileTree(cwd: string, maxDepth = 2, prefix = ""): string[] {
	const lines: string[] = [];
	try {
		const entries = readdirSync(cwd, { withFileTypes: true })
			.filter(
				(e) =>
					!e.name.startsWith(".") &&
					e.name !== "node_modules" &&
					e.name !== "dist" &&
					e.name !== "build",
			)
			.sort((a, b) => {
				if (a.isDirectory() && !b.isDirectory()) return -1;
				if (!a.isDirectory() && b.isDirectory()) return 1;
				return a.name.localeCompare(b.name);
			})
			.slice(0, 40);

		for (const entry of entries) {
			const isDir = entry.isDirectory();
			lines.push(`${prefix}${isDir ? `${entry.name}/` : entry.name}`);
			if (isDir && maxDepth > 1) {
				lines.push(
					...buildFileTree(join(cwd, entry.name), maxDepth - 1, `${prefix}  `),
				);
			}
		}
	} catch {}
	return lines;
}

async function gatherProjectContext(cwd: string): Promise<string> {
	const sections: string[] = [];

	const conventionFiles = [
		"AGENTS.md",
		"CLAUDE.md",
		".claude/CLAUDE.md",
		".cursorrules",
	];
	for (const file of conventionFiles) {
		const content = safeReadFile(join(cwd, file));
		if (content) {
			sections.push(
				`<project-conventions file="${file}">\n${content}\n</project-conventions>`,
			);
		}
	}

	const pkgContent = safeReadFile(join(cwd, "package.json"));
	if (pkgContent) {
		try {
			const pkg = JSON.parse(pkgContent);
			const summary = {
				name: pkg.name,
				description: pkg.description,
				scripts: pkg.scripts ? Object.keys(pkg.scripts) : [],
				dependencies: pkg.dependencies
					? Object.keys(pkg.dependencies).length
					: 0,
				devDependencies: pkg.devDependencies
					? Object.keys(pkg.devDependencies).length
					: 0,
			};
			sections.push(
				`<package-info>\n${JSON.stringify(summary, null, 2)}\n</package-info>`,
			);
		} catch {}
	}

	const tree = buildFileTree(cwd);
	if (tree.length > 0) {
		sections.push(
			`<file-tree root="${basename(cwd)}">\n${tree.join("\n")}\n</file-tree>`,
		);
	}

	const gitBranch = await safeExec("git branch --show-current", cwd);
	if (gitBranch) {
		const gitStatus = await safeExec("git status --short", cwd);
		const gitLog = await safeExec("git log --oneline -5 --no-decorate", cwd);
		const gitParts = [`Branch: ${gitBranch}`];
		if (gitStatus) gitParts.push(`Dirty files:\n${gitStatus}`);
		if (gitLog) gitParts.push(`Recent commits:\n${gitLog}`);
		sections.push(`<git-state>\n${gitParts.join("\n")}\n</git-state>`);
	}

	if (sections.length === 0) return "";

	return `\n\n# Project context (auto-injected)\n\nThe following is automatically gathered context about the current project workspace at \`${cwd}\`. Use this to understand the project without needing to explore from scratch.\n\n${sections.join("\n\n")}`;
}

interface FileMention {
	raw: string;
	absPath: string;
	relPath: string;
	content: string | null;
}

function parseFileMentions(text: string, cwd: string): FileMention[] {
	const mentionRegex = /@([\w./-]+(?:\/[\w./-]+|\.[\w]+))/g;
	const mentions: FileMention[] = [];
	const seen = new Set<string>();

	let match: RegExpExecArray | null = mentionRegex.exec(text);
	while (match !== null) {
		const relPath = match[1];
		if (!seen.has(relPath)) {
			seen.add(relPath);

			const absPath = resolve(cwd, relPath);
			const rel = relative(resolve(cwd), absPath);
			if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
				match = mentionRegex.exec(text);
				continue;
			}
			const content = safeReadFile(absPath, 50_000);
			mentions.push({
				raw: match[0],
				absPath,
				relPath,
				content,
			});
		}
		match = mentionRegex.exec(text);
	}

	return mentions;
}

function buildFileMentionContext(mentions: FileMention[]): string {
	if (mentions.length === 0) return "";

	const parts = mentions
		.filter((m) => m.content !== null)
		.map((m) => `<file path="${m.relPath}">\n${m.content}\n</file>`);

	if (parts.length === 0) return "";
	return `\n\nThe user referenced the following files. Their contents are provided below:\n\n${parts.join("\n\n")}`;
}

interface CommandEntry {
	name: string;
	description: string;
	argumentHint: string;
}

const permissionModeSchema = z.enum([
	"default",
	"acceptEdits",
	"bypassPermissions",
]);

function scanCustomCommands(cwd: string): CommandEntry[] {
	const dirs = [
		join(cwd, ".claude", "commands"),
		join(homedir(), ".claude", "commands"),
	];
	const commands: CommandEntry[] = [];
	const seen = new Set<string>();

	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		try {
			for (const file of readdirSync(dir)) {
				if (!file.endsWith(".md")) continue;
				const name = file.replace(/\.md$/, "");
				if (seen.has(name)) continue;
				seen.add(name);
				const raw = readFileSync(join(dir, file), "utf-8");
				const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
				const descMatch = fmMatch?.[1]?.match(/^description:\s*(.+)$/m);
				const argMatch = fmMatch?.[1]?.match(/^argument-hint:\s*(.+)$/m);
				commands.push({
					name,
					description: descMatch?.[1]?.trim() ?? "",
					argumentHint: argMatch?.[1]?.trim() ?? "",
				});
			}
		} catch (err) {
			console.warn(
				`[ai-chat/scanCustomCommands] Failed to read commands from ${dir}:`,
				err,
			);
		}
	}

	return commands;
}

export const createAiChatRouter = () => {
	return router({
		getConfig: publicProcedure.query(() => ({
			apiUrl: env.NEXT_PUBLIC_API_URL,
		})),

		getModels: publicProcedure.query(() => getAvailableModels()),

		getMessages: publicProcedure
			.input(z.object({ threadId: z.string() }))
			.query(async ({ input }) => {
				const result = await memory.recall({
					threadId: input.threadId,
				});
				return toAISdkV5Messages(result.messages);
			}),

		getSlashCommands: publicProcedure
			.input(z.object({ cwd: z.string() }))
			.query(({ input }) => {
				return { commands: scanCustomCommands(input.cwd) };
			}),

		// TODO: session listing will move to server-side (Postgres) storage
		listSessions: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(async () => {
				return [] as Array<{
					sessionId: string;
					title: string;
					lastActiveAt: number;
					messagePreview?: string;
				}>;
			}),

		deleteSession: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.mutation(({ input }) => {
				const controller = sessionAbortControllers.get(input.sessionId);
				if (controller) controller.abort();
				sessionAbortControllers.delete(input.sessionId);
				sessionRunIds.delete(input.sessionId);
				sessionContext.delete(input.sessionId);
				return { success: true };
			}),

		getClaudeSessionMessages: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.query(async ({ input }) => {
				return readClaudeSessionMessages({ sessionId: input.sessionId });
			}),

		scanClaudeSessions: publicProcedure
			.input(
				z
					.object({
						cursor: z.number().optional(),
						limit: z.number().min(1).max(100).optional(),
					})
					.optional(),
			)
			.query(async ({ input }) => {
				return scanClaudeSessions({
					cursor: input?.cursor ?? 0,
					limit: input?.limit ?? 30,
				});
			}),

		superagent: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					text: z.string(),
					modelId: z.string(),
					cwd: z.string(),
					permissionMode: permissionModeSchema.optional(),
					thinkingEnabled: z.boolean().optional(),
				}),
			)
			.mutation(({ input }) => {
				console.log("[ai-chat/superagent] Received:", {
					sessionId: input.sessionId,
					text: input.text.slice(0, 50),
					modelId: input.modelId,
					cwd: input.cwd,
					permissionMode: input.permissionMode,
				});

				const existingController = sessionAbortControllers.get(input.sessionId);
				if (existingController) existingController.abort();

				const abortController = new AbortController();
				sessionAbortControllers.set(input.sessionId, abortController);
				const requestEntries: [string, string][] = [
					["modelId", input.modelId],
					["cwd", input.cwd],
					...(input.thinkingEnabled
						? ([["thinkingEnabled", "true"]] as [string, string][])
						: []),
				];

				sessionContext.set(input.sessionId, {
					cwd: input.cwd,
					modelId: input.modelId,
					permissionMode: input.permissionMode,
					requestEntries,
				});

				void (async () => {
					try {
						const projectContext = await gatherProjectContext(input.cwd);
						const mentions = parseFileMentions(input.text, input.cwd);
						const fileMentionContext = buildFileMentionContext(mentions);
						const contextInstructions =
							projectContext + fileMentionContext || undefined;

						const requireToolApproval =
							input.permissionMode === "default" ||
							input.permissionMode === "acceptEdits";

						const output = await superagent.stream(input.text, {
							requestContext: new RequestContext(requestEntries),
							maxSteps: 100,
							memory: {
								thread: input.sessionId,
								resource: input.sessionId,
							},
							abortSignal: abortController.signal,
							...(contextInstructions
								? { instructions: contextInstructions }
								: {}),
							...(requireToolApproval ? { requireToolApproval: true } : {}),
							...(input.thinkingEnabled
								? {
										providerOptions: {
											anthropic: {
												thinking: {
													type: "enabled",
													budgetTokens: 10000,
												},
											},
										},
									}
								: {}),
						});

						if (output.runId) {
							sessionRunIds.set(input.sessionId, output.runId);
						}

						await writeToDurableStream(
							output,
							input.sessionId,
							abortController.signal,
						);
					} catch (error) {
						sessionRunIds.delete(input.sessionId);
						sessionContext.delete(input.sessionId);

						if (abortController.signal.aborted) return;
						console.error(
							`[ai-chat] Stream error for ${input.sessionId}:`,
							error,
						);
					} finally {
						if (
							sessionAbortControllers.get(input.sessionId) === abortController
						) {
							sessionAbortControllers.delete(input.sessionId);
						}
					}
				})();

				return { success: true };
			}),

		abortSuperagent: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.mutation(({ input }) => {
				const controller = sessionAbortControllers.get(input.sessionId);
				if (controller) {
					controller.abort();
					return { success: true, aborted: true };
				}
				return { success: true, aborted: false };
			}),

		approveToolCall: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					runId: z.string(),
					approved: z.boolean(),
					permissionMode: permissionModeSchema.optional(),
				}),
			)
			.mutation(({ input }) => {
				if (input.permissionMode) {
					const ctx = sessionContext.get(input.sessionId);
					if (ctx) ctx.permissionMode = input.permissionMode;
				}

				const ctx = sessionContext.get(input.sessionId);
				const reqCtx = ctx
					? new RequestContext(ctx.requestEntries)
					: undefined;

				const abortController = new AbortController();
				sessionAbortControllers.set(input.sessionId, abortController);

				void (async () => {
					try {
						const approvalOpts = {
							runId: input.runId,
							...(reqCtx ? { requestContext: reqCtx } : {}),
						};
						const stream = input.approved
							? await superagent.approveToolCall(approvalOpts)
							: await superagent.declineToolCall(approvalOpts);

						await writeToDurableStream(
							stream,
							input.sessionId,
							abortController.signal,
						);
					} catch (error) {
						sessionRunIds.delete(input.sessionId);
						sessionContext.delete(input.sessionId);

						if (abortController.signal.aborted) return;
						console.error(
							`[ai-chat] Approval stream error for ${input.sessionId}:`,
							error,
						);
					} finally {
						if (
							sessionAbortControllers.get(input.sessionId) === abortController
						) {
							sessionAbortControllers.delete(input.sessionId);
						}
					}
				})();

				return { success: true };
			}),

		answerQuestion: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					runId: z.string(),
					answers: z.record(z.string(), z.string()),
				}),
			)
			.mutation(({ input }) => {
				const ctx = sessionContext.get(input.sessionId);
				const ctxEntries: [string, string][] = ctx
					? [...ctx.requestEntries]
					: [];
				ctxEntries.push(["toolAnswers", JSON.stringify(input.answers)]);
				const reqCtx = new RequestContext(ctxEntries);

				const abortController = new AbortController();
				sessionAbortControllers.set(input.sessionId, abortController);

				void (async () => {
					try {
						const stream = await superagent.approveToolCall({
							runId: input.runId,
							requestContext: reqCtx,
						});

						await writeToDurableStream(
							stream,
							input.sessionId,
							abortController.signal,
						);
					} catch (error) {
						sessionRunIds.delete(input.sessionId);
						sessionContext.delete(input.sessionId);

						if (abortController.signal.aborted) return;
						console.error(
							`[ai-chat] Answer stream error for ${input.sessionId}:`,
							error,
						);
					} finally {
						if (
							sessionAbortControllers.get(input.sessionId) === abortController
						) {
							sessionAbortControllers.delete(input.sessionId);
						}
					}
				})();

				return { success: true };
			}),
	});
};
