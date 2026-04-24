/**
 * Read tool renderer. Shows the file path + optional line range in the
 * trigger; body shows the output text (truncated with a scrollable
 * container).
 */

import type { ToolPart } from "@superset/chat/shared";
import { FileText } from "lucide-react";
import { BasicTool } from "../BasicTool";
import { ToolErrorCard } from "../ToolErrorCard";
import {
	extractShellOutput,
	inputAsRecord,
	isToolError,
	pickNumber,
	pickString,
	statusFromToolState,
} from "../toolHelpers";

const PATH_KEYS = ["file_path", "filePath", "path", "filename"] as const;
const OFFSET_KEYS = ["offset", "start"] as const;
const LIMIT_KEYS = ["limit", "count"] as const;

export function ReadTool({ part }: { part: ToolPart }) {
	const input = inputAsRecord(part.state);
	const path = pickString(input, PATH_KEYS) ?? "";
	const offset = pickNumber(input, OFFSET_KEYS);
	const limit = pickNumber(input, LIMIT_KEYS);

	if (isToolError(part) && part.state.kind === "error") {
		return (
			<ToolErrorCard
				tool="Read"
				error={part.state.error.message}
				subtitle={path || undefined}
			/>
		);
	}

	const args: string[] = [];
	if (offset !== undefined) args.push(`offset=${offset}`);
	if (limit !== undefined) args.push(`limit=${limit}`);

	const output =
		part.state.kind === "completed" ? extractShellOutput(part.state.output) : "";

	return (
		<BasicTool
			icon={FileText}
			status={statusFromToolState(part.state)}
			defer
			trigger={{
				title: "Read",
				subtitle: path,
				args,
			}}
		>
			<pre
				data-scrollable="true"
				className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]"
			>
				{output}
			</pre>
		</BasicTool>
	);
}
