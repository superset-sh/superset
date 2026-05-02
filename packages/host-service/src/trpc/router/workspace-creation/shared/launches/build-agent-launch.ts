import type { AgentDefinitionId } from "@superset/shared/agent-catalog";
import {
	type AttachmentFile,
	buildLaunchContext,
	buildLaunchSpec,
	type ContentPart,
	defaultContributorRegistry,
	type LaunchSource,
	type ResolveCtx,
} from "@superset/launch-context";
import type { PromptTransport } from "../../../settings/agent-presets";
import { synthAgentConfig } from "./synth-agent-config";

export interface HostAgentPresetRow {
	presetId: string;
	label: string;
	command: string;
	args: string[];
	promptTransport: PromptTransport;
	promptArgs: string[];
	env: Record<string, string>;
}

export interface BuildAgentLaunchInput {
	projectId: string;
	preset: HostAgentPresetRow;
	prompt?: string;
	internalTaskIds: string[];
	githubIssueUrls: string[];
	linkedPrUrl?: string;
	attachments: AttachmentFile[];
	/**
	 * How to fetch issue/PR/task bodies. Wiring layer (#26) supplies one
	 * that calls the host's gh-CLI helpers + (optionally) the cloud API
	 * for internal tasks. Kept injected so this module stays unit-testable
	 * without those side effects.
	 */
	resolveCtx: ResolveCtx;
}

export interface TerminalLaunchPlan {
	kind: "terminal";
	label: string;
	spawn: {
		command: string;
		args: string[];
		env: Record<string, string>;
	};
	/**
	 * For stdin-transport agents: the prompt text to pipe into the spawned
	 * process's stdin after spawn. Undefined when transport is "argv" (the
	 * prompt is already in `spawn.args`) or when there's no prompt at all.
	 */
	stdinPrompt?: string;
	attachmentsToWrite: AttachmentFile[];
}

/**
 * Build a launch plan for a terminal agent from PR1-shaped preset data
 * + a launch context. Returns null when there's no agent, no sources,
 * or the resulting spec is empty.
 *
 * Chat agents are not handled in this PR — task #29 will add a parallel
 * `ChatLaunchPlan` branch. For now this module is terminal-only.
 */
export async function buildAgentLaunch(
	input: BuildAgentLaunchInput,
): Promise<TerminalLaunchPlan | null> {
	const sources = buildLaunchSources(input);
	if (sources.length === 0) return null;

	const ctx = await buildLaunchContext(
		{
			projectId: input.projectId,
			sources,
			agent: { id: input.preset.presetId as AgentDefinitionId },
		},
		{
			contributors: defaultContributorRegistry,
			resolveCtx: input.resolveCtx,
		},
	);

	const spec = buildLaunchSpec(
		ctx,
		synthAgentConfig({
			presetId: input.preset.presetId,
			label: input.preset.label,
			command: input.preset.command,
			promptTransport: input.preset.promptTransport,
		}),
	);
	if (!spec) return null;

	const { attachmentsToWrite, inlineByIndex } = assignFilenamesAndCollect(
		spec.user,
		spec.attachments,
	);
	const promptText = flattenUserContentForTerminal(spec.user, inlineByIndex);

	return composeTerminalPlan({
		preset: input.preset,
		promptText,
		attachmentsToWrite,
	});
}

function buildLaunchSources(input: BuildAgentLaunchInput): LaunchSource[] {
	const sources: LaunchSource[] = [];

	const prompt = input.prompt?.trim();
	if (prompt) {
		sources.push({
			kind: "user-prompt",
			content: [{ type: "text", text: prompt }],
		});
	}

	for (const taskId of input.internalTaskIds) {
		sources.push({ kind: "internal-task", id: taskId });
	}

	for (const url of input.githubIssueUrls) {
		sources.push({ kind: "github-issue", url });
	}

	if (input.linkedPrUrl) {
		sources.push({ kind: "github-pr", url: input.linkedPrUrl });
	}

	for (const file of input.attachments) {
		sources.push({ kind: "attachment", file });
	}

	return sources;
}

/**
 * Compose the spawn argv for a terminal preset. Mirrors the launch
 * resolution comment in `agent-presets.ts`:
 *
 *   prompt
 *     ? [command, ...args, ...promptArgs, ...(transport === "argv" ? [prompt] : [])]
 *     : [command, ...args]
 *
 * Stdin-transport prompts are returned as `stdinPrompt` for the
 * spawner to write after spawn. No shell-string escape hatches.
 */
function composeTerminalPlan(input: {
	preset: HostAgentPresetRow;
	promptText: string;
	attachmentsToWrite: AttachmentFile[];
}): TerminalLaunchPlan {
	const { preset, promptText, attachmentsToWrite } = input;
	const hasPrompt = promptText.length > 0;

	if (!hasPrompt) {
		return {
			kind: "terminal",
			label: preset.label,
			spawn: {
				command: preset.command,
				args: [...preset.args],
				env: { ...preset.env },
			},
			attachmentsToWrite,
		};
	}

	const argv: string[] = [...preset.args, ...preset.promptArgs];
	if (preset.promptTransport === "argv") argv.push(promptText);

	return {
		kind: "terminal",
		label: preset.label,
		spawn: {
			command: preset.command,
			args: argv,
			env: { ...preset.env },
		},
		stdinPrompt: preset.promptTransport === "stdin" ? promptText : undefined,
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

function assignFilenamesAndCollect(
	user: ContentPart[],
	attachments: ContentPart[],
): {
	attachmentsToWrite: AttachmentFile[];
	inlineByIndex: Map<number, string>;
} {
	const used = new Set<string>();
	const out: AttachmentFile[] = [];
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
