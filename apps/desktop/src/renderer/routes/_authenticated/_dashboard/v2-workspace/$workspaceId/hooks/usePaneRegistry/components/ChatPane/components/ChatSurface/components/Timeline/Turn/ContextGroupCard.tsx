/**
 * Context-group card — collapses a run of consecutive read / glob /
 * grep / list tool calls into one entry with a count summary. Expand
 * to see each individual tool render via its normal per-tool
 * component.
 */

import type { Message, ToolPart } from "@superset/chat/shared";
import { FolderSearch } from "lucide-react";
import { BasicTool } from "../Parts/ToolPart/BasicTool";
import { getToolRenderer } from "../Parts/ToolPart/toolRegistry";

export interface ContextGroupCardProps {
	parts: ToolPart[];
	message: Message;
}

function normalizeName(tool: string): string {
	return tool.toLowerCase().replace(/^tool[-_]?/, "");
}

function summarize(parts: ToolPart[]): string {
	const counts = new Map<string, number>();
	for (const p of parts) {
		const name = displayName(normalizeName(p.tool));
		counts.set(name, (counts.get(name) ?? 0) + 1);
	}
	return Array.from(counts.entries())
		.map(([name, n]) => (n === 1 ? name : `${n} ${name}s`))
		.join(", ");
}

function displayName(normalized: string): string {
	switch (normalized) {
		case "read":
		case "read_file":
		case "view":
			return "read";
		case "grep":
		case "search":
		case "code_search":
			return "grep";
		case "glob":
			return "glob";
		case "list":
		case "ls":
		case "list_dir":
			return "list";
		default:
			return normalized;
	}
}

/**
 * Overall status for the group: running if any child is
 * running/pending, error if any is errored (when not running),
 * otherwise completed.
 */
function groupStatus(parts: ToolPart[]): "running" | "error" | "completed" {
	let anyRunning = false;
	let anyError = false;
	for (const p of parts) {
		if (p.state.kind === "input-streaming" || p.state.kind === "running") {
			anyRunning = true;
		} else if (p.state.kind === "error") {
			anyError = true;
		}
	}
	if (anyRunning) return "running";
	if (anyError) return "error";
	return "completed";
}

export function ContextGroupCard({ parts, message }: ContextGroupCardProps) {
	const status = groupStatus(parts);
	const title = "Context";
	const subtitle = summarize(parts);

	return (
		<BasicTool
			icon={FolderSearch}
			status={status}
			defer
			trigger={{
				title,
				subtitle,
				args: [`${parts.length} calls`],
			}}
		>
			<div className="space-y-1">
				{parts.map((p) => {
					const Renderer = getToolRenderer(p.tool);
					return (
						<div
							key={p.id}
							// Collapsed copies look a bit tight inside the group card;
							// give each a small left rule so visually they feel nested.
							className="border-border-weak border-l pl-2"
						>
							<Renderer part={p} />
						</div>
					);
				})}
			</div>
		</BasicTool>
	);
}
// `message` is plumbed in for future per-tool renderers that need
// context — unused by today's renderers, but kept in the prop shape so
// we don't have to thread it again later.
// biome-ignore lint/correctness/noUnusedVariables: reserved for extension
const _unused: Message | undefined = undefined;
