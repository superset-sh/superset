import type {
	AgentLaunchRequest,
	AgentLaunchSource,
} from "@superset/shared/agent-launch";
import {
	buildPromptCommandFromAgentConfig,
	getCommandFromAgentConfig,
	type ResolvedAgentConfig,
	type TerminalResolvedAgentConfig,
} from "shared/utils/agent-settings";
import type { AgentLaunchSpec, ContentPart } from "./types";

interface BuildOpts {
	workspaceId: string;
	source: AgentLaunchSource;
}

/**
 * Bridge V2 AgentLaunchSpec into the V1 AgentLaunchRequest shape so the
 * existing terminal-adapter / chat-adapter infrastructure can consume
 * it verbatim. No new IPC wiring needed.
 *
 * Responsibilities:
 * - Assign collision-safe filenames across all binary parts (inline in
 *   user + explicit attachments) so the prompt text's path refs match
 *   what the adapter writes to disk.
 * - Flatten spec.user to markdown text, with file/image parts rendered
 *   as `![filename](.superset/attachments/filename)` at their inline
 *   position — preserves editor order for CLI agents.
 * - Convert Uint8Array binary data to base64 data URLs (V1 wire format).
 * - Chat: initialPrompt = flattened text.
 * - Terminal: command = buildPromptCommandFromAgentConfig(flattened text).
 *
 * Base64 encoding happens at this boundary only — internal plumbing
 * stays on Uint8Array.
 */
export function buildAgentLaunchRequest(
	spec: AgentLaunchSpec,
	agentConfig: ResolvedAgentConfig,
	opts: BuildOpts,
): AgentLaunchRequest | null {
	if (spec.agentId === "none" || !agentConfig.enabled) return null;

	const assigned = assignFilenames(spec);
	const initialFiles = assigned.length > 0 ? assigned.map(toV1File) : undefined;
	const promptText = flattenUserContent(spec.user, assigned);

	if (agentConfig.kind === "chat") {
		return {
			kind: "chat",
			workspaceId: opts.workspaceId,
			agentType: agentConfig.id,
			source: opts.source,
			chat: {
				initialPrompt: promptText || undefined,
				initialFiles,
				model: agentConfig.model,
				taskSlug: spec.taskSlug,
			},
		};
	}

	const command = buildTerminalCommand(agentConfig, promptText);
	if (!command) return null;
	return {
		kind: "terminal",
		workspaceId: opts.workspaceId,
		agentType: agentConfig.id,
		source: opts.source,
		terminal: {
			command,
			name: agentConfig.label,
			initialFiles,
		},
	};
}

function buildTerminalCommand(
	config: TerminalResolvedAgentConfig,
	prompt: string,
): string | null {
	if (!prompt.trim()) return getCommandFromAgentConfig(config);
	return buildPromptCommandFromAgentConfig({
		prompt,
		randomId: crypto.randomUUID(),
		config,
	});
}

// -------------------------------------------------------------------------
// Filename assignment (collision-safe across inline + explicit attachments)
// -------------------------------------------------------------------------

type BinaryPart = Exclude<ContentPart, { type: "text" }>;

interface AssignedBinary {
	part: BinaryPart;
	filename: string;
	/** True if this binary appeared inline within spec.user */
	inline: boolean;
	/** Index within its owning array — used to identify user-inline binaries when flattening */
	inlineIndex?: number;
}

function assignFilenames(spec: AgentLaunchSpec): AssignedBinary[] {
	const used = new Set<string>();
	const out: AssignedBinary[] = [];

	spec.user.forEach((part, index) => {
		if (part.type === "text") return;
		out.push({
			part,
			filename: nextName(part, used, out.length),
			inline: true,
			inlineIndex: index,
		});
	});

	for (const part of spec.attachments) {
		if (part.type === "text") continue;
		out.push({
			part,
			filename: nextName(part, used, out.length),
			inline: false,
		});
	}

	return out;
}

function nextName(
	part: BinaryPart,
	used: Set<string>,
	fallbackIndex: number,
): string {
	const raw = part.type === "file" ? part.filename : undefined;
	const sanitized = raw ? sanitize(raw) : "";
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

function sanitize(filename: string): string {
	const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
	return cleaned.trim() ? cleaned : "";
}

// -------------------------------------------------------------------------
// Flatten user content to markdown text with inline file/image refs
// -------------------------------------------------------------------------

function flattenUserContent(
	user: ContentPart[],
	assigned: AssignedBinary[],
): string {
	const inlineByIndex = new Map<number, string>();
	for (const a of assigned) {
		if (a.inline && a.inlineIndex !== undefined) {
			inlineByIndex.set(a.inlineIndex, a.filename);
		}
	}

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

// -------------------------------------------------------------------------
// Base64 conversion at the V1 wire boundary
// -------------------------------------------------------------------------

function toV1File(entry: AssignedBinary): {
	data: string;
	mediaType: string;
	filename?: string;
} {
	const { part, filename } = entry;
	const base64 = Buffer.from(part.data).toString("base64");
	return {
		data: `data:${part.mediaType};base64,${base64}`,
		mediaType: part.mediaType,
		filename,
	};
}
