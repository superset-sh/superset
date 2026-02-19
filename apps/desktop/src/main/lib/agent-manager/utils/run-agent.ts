import { exec } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { RequestContext, superagent, toAISdkStream } from "@superset/agent";
import type { SessionHost } from "@superset/durable-session/host";
import type { UIMessage, UIMessageChunk } from "ai";
import { env } from "main/env.main";

// ---------------------------------------------------------------------------
// Shared session state
// ---------------------------------------------------------------------------

export const sessionAbortControllers = new Map<string, AbortController>();
export const sessionRunIds = new Map<string, string>();

interface SessionContext {
	cwd: string;
	modelId: string;
	permissionMode?: string;
	requestEntries: [string, string][];
}

export const sessionContext = new Map<string, SessionContext>();

// ---------------------------------------------------------------------------
// runAgent — core agent execution
// ---------------------------------------------------------------------------

export interface RunAgentOptions {
	sessionId: string;
	text: string;
	message?: UIMessage;
	host: SessionHost;
	modelId: string;
	cwd: string;
	permissionMode?: string;
	thinkingEnabled?: boolean;
	authToken?: string;
}

export async function runAgent(options: RunAgentOptions): Promise<void> {
	const {
		sessionId,
		text,
		message,
		host,
		modelId,
		cwd,
		permissionMode,
		thinkingEnabled,
		authToken,
	} = options;

	// Abort any existing agent for this session
	const existingController = sessionAbortControllers.get(sessionId);
	if (existingController) existingController.abort();

	const abortController = new AbortController();
	sessionAbortControllers.set(sessionId, abortController);

	const requestEntries: [string, string][] = [
		["modelId", modelId],
		["cwd", cwd],
		["apiUrl", env.NEXT_PUBLIC_API_URL],
		...(authToken ? ([["authToken", authToken]] as [string, string][]) : []),
		...(thinkingEnabled
			? ([["thinkingEnabled", "true"]] as [string, string][])
			: []),
	];

	sessionContext.set(sessionId, {
		cwd,
		modelId,
		permissionMode,
		requestEntries,
	});

	try {
		const projectContext = await gatherProjectContext(cwd);
		const mentions = parseFileMentions(text, cwd);
		const fileMentionContext = buildFileMentionContext(mentions);
		const contextInstructions =
			projectContext + fileMentionContext || undefined;

		const requireToolApproval =
			permissionMode === "default" || permissionMode === "acceptEdits";

		// When the message has file parts, build a CoreUserMessage with
		// multimodal content so the model receives images/files.
		const fileParts = message?.parts?.filter((p) => p.type === "file") ?? [];
		const streamInput =
			fileParts.length > 0
				? {
						role: "user" as const,
						content: [
							...(text ? [{ type: "text" as const, text }] : []),
							...fileParts.map((f) => {
								if (f.mediaType.startsWith("image/")) {
									return {
										type: "image" as const,
										image: new URL(f.url),
										mimeType: f.mediaType as `image/${string}`,
									};
								}
								// Anthropic only supports text/plain, application/pdf, and
								// image/* for file parts. Normalize other text-based types
								// (e.g. text/markdown, text/csv, application/json) to
								// text/plain so they don't throw
								// AI_UnsupportedFunctionalityError.
								const normalizedMimeType =
									f.mediaType === "application/pdf"
										? f.mediaType
										: "text/plain";
								return {
									type: "file" as const,
									data: new URL(f.url),
									mimeType: normalizedMimeType,
								};
							}),
						],
					}
				: text;

		const output = await superagent.stream(streamInput, {
			requestContext: new RequestContext(requestEntries),
			maxSteps: 100,
			memory: {
				thread: sessionId,
				resource: sessionId,
			},
			abortSignal: abortController.signal,
			...(contextInstructions ? { instructions: contextInstructions } : {}),
			...(requireToolApproval ? { requireToolApproval: true } : {}),
			...(thinkingEnabled
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
			sessionRunIds.set(sessionId, output.runId);
		}

		await writeToDurableStream(output, host, abortController.signal);
	} catch (error) {
		sessionRunIds.delete(sessionId);
		sessionContext.delete(sessionId);

		if (abortController.signal.aborted) return;

		// Write error chunk to stream so client sees isComplete = true
		try {
			await writeErrorChunk(host, error);
		} catch {
			/* best effort */
		}
		console.error(`[run-agent] Stream error for ${sessionId}:`, error);
	} finally {
		if (sessionAbortControllers.get(sessionId) === abortController) {
			sessionAbortControllers.delete(sessionId);
		}
	}
}

// ---------------------------------------------------------------------------
// resumeAgent — approve/decline tool calls, answer questions
// ---------------------------------------------------------------------------

export interface ResumeAgentOptions {
	sessionId: string;
	runId: string;
	host: SessionHost;
	approved: boolean;
	answers?: Record<string, string>;
	permissionMode?: string;
}

export async function resumeAgent(options: ResumeAgentOptions): Promise<void> {
	const { sessionId, runId, host, approved, answers, permissionMode } = options;

	if (permissionMode) {
		const ctx = sessionContext.get(sessionId);
		if (ctx) ctx.permissionMode = permissionMode;
	}

	const ctx = sessionContext.get(sessionId);
	const ctxEntries: [string, string][] = ctx ? [...ctx.requestEntries] : [];

	if (answers) {
		ctxEntries.push(["toolAnswers", JSON.stringify(answers)]);
	}

	const reqCtx = new RequestContext(ctxEntries);
	const abortController = new AbortController();
	sessionAbortControllers.set(sessionId, abortController);

	try {
		const approvalOpts = {
			runId,
			requestContext: reqCtx,
		};

		const stream = approved
			? await superagent.approveToolCall(approvalOpts)
			: await superagent.declineToolCall(approvalOpts);

		await writeToDurableStream(stream, host, abortController.signal);
	} catch (error) {
		sessionRunIds.delete(sessionId);
		sessionContext.delete(sessionId);

		if (abortController.signal.aborted) return;

		try {
			await writeErrorChunk(host, error);
		} catch {
			/* best effort */
		}
		console.error(`[run-agent] Resume error for ${sessionId}:`, error);
	} finally {
		if (sessionAbortControllers.get(sessionId) === abortController) {
			sessionAbortControllers.delete(sessionId);
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function writeErrorChunk(
	host: SessionHost,
	error: unknown,
): Promise<void> {
	const messageId = crypto.randomUUID();
	const errorText = error instanceof Error ? error.message : "Agent error";
	const stream = new ReadableStream<UIMessageChunk>({
		start(controller) {
			controller.enqueue({ type: "error", errorText } as UIMessageChunk);
			controller.enqueue({ type: "abort" } as UIMessageChunk);
			controller.close();
		},
	});
	await host.writeStream(messageId, stream);
}

async function writeToDurableStream(
	stream: Parameters<typeof toAISdkStream>[0],
	host: SessionHost,
	abortSignal: AbortSignal,
) {
	const messageId = crypto.randomUUID();
	const aiStream = toAISdkStream(stream, { from: "agent" });

	await host.writeStream(messageId, aiStream as unknown as ReadableStream, {
		signal: abortSignal,
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
