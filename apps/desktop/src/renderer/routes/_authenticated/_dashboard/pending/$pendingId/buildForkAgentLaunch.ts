import type {
	PendingChatLaunch,
	PendingTerminalLaunch,
	PendingWorkspaceRow,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { buildLaunchSpec } from "shared/context/buildLaunchSpec";
import { buildLaunchContext } from "shared/context/composer";
import { defaultContributorRegistry } from "shared/context/contributors";
import type {
	AgentLaunchSpec,
	AttachmentFile,
	ContentPart,
	LaunchSource,
	ResolveCtx,
} from "shared/context/types";
import { isTerminalAgentDefinition } from "@superset/shared/agent-catalog";
import {
	buildPromptCommandFromAgentConfig,
	getCommandFromAgentConfig,
	getFallbackAgentId,
	indexResolvedAgentConfigs,
	type ResolvedAgentConfig,
} from "shared/utils/agent-settings";

export interface LoadedAttachment {
	data: string; // base64 data URL
	mediaType: string;
	filename: string;
}

export interface BuildForkAgentLaunchInputs {
	pending: Pick<
		PendingWorkspaceRow,
		"projectId" | "prompt" | "linkedIssues" | "linkedPR"
	>;
	attachments: LoadedAttachment[] | undefined;
	agentConfigs: ResolvedAgentConfig[];
}

/**
 * The pending page writes one of these to the pending row after
 * host-service.create resolves; the V2 workspace page consumes it on
 * mount. See apps/desktop/docs/V2_LAUNCH_CONTEXT.md.
 */
export type PendingLaunchBuild =
	| {
			kind: "terminal";
			launch: PendingTerminalLaunch;
			/**
			 * Binary payloads to write to `<worktree>/.superset/attachments/`
			 * via workspaceTrpc.filesystem before setting `row.terminalLaunch`.
			 * Already named with collision-safe filenames matching
			 * `launch.attachmentNames` and any inline refs in `launch.command`.
			 */
			attachmentsToWrite: Array<{
				filename: string;
				mediaType: string;
				data: Uint8Array;
			}>;
	  }
	| { kind: "chat"; launch: PendingChatLaunch };

/**
 * Builds a PendingLaunchBuild record describing how the V2 workspace
 * page should dispatch the agent once it mounts. The pending page owns
 * applying this to the pending row (and writing terminal attachments
 * to disk). Returns null for no-op launches (e.g. no sources, no agent
 * enabled).
 *
 * Phase 1 note: issue / PR / task bodies are not fetched over HTTP yet
 * (host-service lacks a body endpoint). The resolver returns empty
 * bodies — the agent sees title/URL/task-slug metadata only. When
 * host-service grows getIssueContent / getPullRequestContent /
 * getInternalTaskContent, swap the resolver stubs here.
 */
export async function buildForkAgentLaunch(
	inputs: BuildForkAgentLaunchInputs,
): Promise<PendingLaunchBuild | null> {
	const agentId = getFallbackAgentId(inputs.agentConfigs);
	if (!agentId) return null;

	const agentConfig = indexResolvedAgentConfigs(inputs.agentConfigs).get(
		agentId,
	);
	if (!agentConfig || !agentConfig.enabled) return null;

	const sources = buildLaunchSourcesFromPending(
		inputs.pending,
		inputs.attachments,
	);
	if (sources.length === 0) return null;

	const ctx = await buildLaunchContext(
		{
			projectId: inputs.pending.projectId,
			sources,
			agent: { id: agentId },
		},
		{
			contributors: defaultContributorRegistry,
			resolveCtx: buildResolveCtxFromPending(inputs.pending),
		},
	);
	const spec = buildLaunchSpec(ctx, agentConfig);
	if (!spec) return null;

	if (isTerminalAgentDefinition(agentConfig)) {
		return buildTerminalLaunch(spec, agentConfig);
	}
	return buildChatLaunch(spec, agentConfig);
}

// ---------------------------------------------------------------------------
// Terminal launch assembly
// ---------------------------------------------------------------------------

function buildTerminalLaunch(
	spec: AgentLaunchSpec,
	agentConfig: Extract<ResolvedAgentConfig, { kind: "terminal" }>,
): PendingLaunchBuild | null {
	const { attachmentsToWrite, inlineByIndex } = assignFilenamesAndCollect(
		spec.user,
		spec.attachments,
	);
	const promptText = flattenUserContentForTerminal(spec.user, inlineByIndex);

	const command = promptText.trim()
		? buildPromptCommandFromAgentConfig({
				prompt: promptText,
				randomId: crypto.randomUUID(),
				config: agentConfig,
			})
		: getCommandFromAgentConfig(agentConfig);
	if (!command) return null;

	return {
		kind: "terminal",
		launch: {
			command,
			name: agentConfig.label,
			attachmentNames: attachmentsToWrite.map((a) => a.filename),
		},
		attachmentsToWrite,
	};
}

function flattenUserContentForTerminal(
	user: ContentPart[],
	inlineByIndex: Map<number, string>,
): string {
	const out: string[] = [];
	user.forEach((part, index) => {
		if (part.type === "text") {
			out.push(part.text);
			return;
		}
		const filename = inlineByIndex.get(index);
		if (!filename) return;
		out.push(`![${filename}](.superset/attachments/${filename})`);
	});
	return out.join("").trim();
}

// ---------------------------------------------------------------------------
// Chat launch assembly
// ---------------------------------------------------------------------------

function buildChatLaunch(
	spec: AgentLaunchSpec,
	agentConfig: Extract<ResolvedAgentConfig, { kind: "chat" }>,
): PendingLaunchBuild {
	const initialPrompt = extractTextParts(spec.user).join("\n\n").trim();
	const binaries = [
		...spec.user.filter((p) => p.type !== "text"),
		...spec.attachments.filter((p) => p.type !== "text"),
	];
	const initialFiles = binaries.length
		? binaries.map((part) => ({
				data: toBase64DataUrl(part),
				mediaType: part.mediaType,
				filename: part.type === "file" ? part.filename : undefined,
			}))
		: undefined;

	return {
		kind: "chat",
		launch: {
			initialPrompt: initialPrompt || undefined,
			initialFiles,
			model: agentConfig.model,
			taskSlug: spec.taskSlug,
		},
	};
}

function extractTextParts(parts: ContentPart[]): string[] {
	return parts
		.filter((p): p is Extract<ContentPart, { type: "text" }> => p.type === "text")
		.map((p) => p.text);
}

function toBase64DataUrl(
	part: Exclude<ContentPart, { type: "text" }>,
): string {
	const base64 = Buffer.from(part.data).toString("base64");
	return `data:${part.mediaType};base64,${base64}`;
}

// ---------------------------------------------------------------------------
// Shared: collect binary parts into disk-ready attachments with stable names
// ---------------------------------------------------------------------------

function assignFilenamesAndCollect(
	user: ContentPart[],
	attachments: ContentPart[],
): {
	attachmentsToWrite: Array<{
		filename: string;
		mediaType: string;
		data: Uint8Array;
	}>;
	inlineByIndex: Map<number, string>;
} {
	const used = new Set<string>();
	const out: Array<{ filename: string; mediaType: string; data: Uint8Array }> =
		[];
	const inlineByIndex = new Map<number, string>();

	user.forEach((part, index) => {
		if (part.type === "text") return;
		const filename = nextUniqueName(part, used, out.length);
		inlineByIndex.set(index, filename);
		out.push({ filename, mediaType: part.mediaType, data: part.data });
	});

	for (const part of attachments) {
		if (part.type === "text") continue;
		const filename = nextUniqueName(part, used, out.length);
		out.push({ filename, mediaType: part.mediaType, data: part.data });
	}

	return { attachmentsToWrite: out, inlineByIndex };
}

function nextUniqueName(
	part: Exclude<ContentPart, { type: "text" }>,
	used: Set<string>,
	fallbackIndex: number,
): string {
	const raw = part.type === "file" ? part.filename : undefined;
	const sanitized = raw ? sanitizeFilename(raw) : "";
	let name = sanitized;
	if (!name) {
		let counter = fallbackIndex + 1;
		do {
			name = `attachment_${counter}`;
			counter++;
		} while (used.has(name));
	} else if (used.has(name)) {
		const segs = name.split(".");
		const ext = segs.length > 1 ? segs.pop() : undefined;
		const base = segs.join(".");
		let counter = 1;
		let candidate: string;
		do {
			candidate = ext ? `${base}_${counter}.${ext}` : `${name}_${counter}`;
			counter++;
		} while (used.has(candidate));
		name = candidate;
	}
	used.add(name);
	return name;
}

function sanitizeFilename(filename: string): string {
	const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
	return cleaned.trim() ? cleaned : "";
}

// ---------------------------------------------------------------------------
// Source + ResolveCtx (unchanged from prior implementation)
// ---------------------------------------------------------------------------

export function buildLaunchSourcesFromPending(
	pending: BuildForkAgentLaunchInputs["pending"],
	attachments: LoadedAttachment[] | undefined,
): LaunchSource[] {
	const sources: LaunchSource[] = [];

	const prompt = pending.prompt?.trim();
	if (prompt) {
		sources.push({
			kind: "user-prompt",
			content: [{ type: "text", text: prompt }],
		});
	}

	for (const issue of pending.linkedIssues) {
		if (issue.source === "internal" && issue.taskId) {
			sources.push({ kind: "internal-task", id: issue.taskId });
		} else if (issue.source === "github" && issue.url) {
			sources.push({ kind: "github-issue", url: issue.url });
		}
	}

	if (pending.linkedPR?.url) {
		sources.push({ kind: "github-pr", url: pending.linkedPR.url });
	}

	for (const attachment of attachments ?? []) {
		sources.push({
			kind: "attachment",
			file: dataUrlAttachmentToBytes(attachment),
		});
	}

	return sources;
}

function dataUrlAttachmentToBytes(loaded: LoadedAttachment): AttachmentFile {
	const match = loaded.data.match(/^data:[^;]+;base64,(.+)$/);
	const base64 = match?.[1] ?? "";
	return {
		data: Uint8Array.from(Buffer.from(base64, "base64")),
		mediaType: loaded.mediaType,
		filename: loaded.filename,
	};
}

function buildResolveCtxFromPending(
	pending: BuildForkAgentLaunchInputs["pending"],
): ResolveCtx {
	return {
		projectId: pending.projectId,
		signal: new AbortController().signal,
		fetchIssue: async (url) => {
			const match = pending.linkedIssues.find(
				(i) => i.source === "github" && i.url === url,
			);
			if (!match) {
				throw Object.assign(new Error(`Issue not found: ${url}`), {
					status: 404,
				});
			}
			return {
				number: match.number ?? 0,
				url: match.url ?? url,
				title: match.title,
				body: "",
				slug: match.slug,
			};
		},
		fetchPullRequest: async (url) => {
			if (!pending.linkedPR || pending.linkedPR.url !== url) {
				throw Object.assign(new Error(`PR not found: ${url}`), {
					status: 404,
				});
			}
			return {
				number: pending.linkedPR.prNumber,
				url: pending.linkedPR.url,
				title: pending.linkedPR.title,
				body: "",
				branch: "",
			};
		},
		fetchInternalTask: async (id) => {
			const match = pending.linkedIssues.find(
				(i) => i.source === "internal" && i.taskId === id,
			);
			if (!match) {
				throw Object.assign(new Error(`Task not found: ${id}`), {
					status: 404,
				});
			}
			return {
				id,
				slug: match.slug,
				title: match.title,
				description: null,
			};
		},
	};
}
