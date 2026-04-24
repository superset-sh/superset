/**
 * Generic tool renderer — fallback for tools that don't have a
 * registered per-tool component. Still uses BasicTool so layout and
 * status treatment are consistent with purpose-built renderers.
 */

import type { ToolPart } from "@superset/chat/shared";
import { Wrench } from "lucide-react";
import { BasicTool } from "./BasicTool";
import { ToolErrorCard } from "./ToolErrorCard";
import {
	argsFromInput,
	inputAsRecord,
	isToolError,
	pickString,
	statusFromToolState,
} from "./toolHelpers";

const LABEL_KEYS = [
	"description",
	"query",
	"url",
	"filePath",
	"path",
	"pattern",
	"name",
] as const;

const SKIP_LABEL_KEYS = new Set<string>(LABEL_KEYS as unknown as string[]);

export function GenericTool({ part }: { part: ToolPart }) {
	const input = inputAsRecord(part.state);
	const label = pickString(input, LABEL_KEYS);
	const args = argsFromInput(input, SKIP_LABEL_KEYS);

	if (isToolError(part) && part.state.kind === "error") {
		return (
			<ToolErrorCard
				tool={part.tool}
				error={part.state.error.message}
				subtitle={label}
			/>
		);
	}

	return (
		<BasicTool
			icon={Wrench}
			status={statusFromToolState(part.state)}
			defer
			trigger={{
				title: part.tool,
				subtitle: label,
				args,
			}}
		>
			<div className="space-y-2">
				<div>
					<div className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wide">
						input
					</div>
					<pre
						data-scrollable="true"
						className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]"
					>
						{safeJson(part.state.input)}
					</pre>
				</div>
				{part.state.kind === "completed" && (
					<div>
						<div className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wide">
							output
						</div>
						<pre
							data-scrollable="true"
							className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]"
						>
							{safeJson(part.state.output)}
						</pre>
					</div>
				)}
			</div>
		</BasicTool>
	);
}

function safeJson(v: unknown): string {
	try {
		if (typeof v === "string") return v;
		return JSON.stringify(v, null, 2);
	} catch {
		return String(v);
	}
}
