/**
 * Group consecutive "context" tool parts (read / grep / glob / list)
 * inside an assistant message into a single renderable card. Ports
 * OpenCode's message-part.tsx:696-761 grouping logic, scoped to one
 * assistant message.
 *
 * A run of 2+ adjacent context tools collapses; a single context tool
 * renders normally.
 */

import type { Part, ToolPart } from "@superset/chat/shared";

const CONTEXT_TOOLS: ReadonlySet<string> = new Set([
	"read",
	"read_file",
	"view",
	"grep",
	"search",
	"code_search",
	"glob",
	"list",
	"ls",
	"list_dir",
]);

function isContextTool(part: Part): part is ToolPart {
	if (part.type !== "tool") return false;
	return CONTEXT_TOOLS.has(part.tool.toLowerCase().replace(/^tool[-_]?/, ""));
}

export type GroupedPartEntry =
	| { kind: "single"; part: Part }
	| { kind: "context-group"; parts: ToolPart[] };

export function groupContextRuns(parts: Part[]): GroupedPartEntry[] {
	if (parts.length === 0) return [];
	const out: GroupedPartEntry[] = [];
	let run: ToolPart[] = [];
	const flushRun = () => {
		if (run.length === 0) return;
		if (run.length === 1) {
			// Single context tool — render as normal `single`.
			out.push({ kind: "single", part: run[0] as Part });
		} else {
			out.push({ kind: "context-group", parts: run });
		}
		run = [];
	};
	for (const part of parts) {
		if (isContextTool(part)) {
			run.push(part);
			continue;
		}
		flushRun();
		out.push({ kind: "single", part });
	}
	flushRun();
	return out;
}
