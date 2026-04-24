/**
 * Write tool renderer. Shows filename in the trigger and the new file
 * content as a scrollable block in the body.
 */

import type { ToolPart } from "@superset/chat/shared";
import { FilePlus } from "lucide-react";
import { BasicTool } from "../BasicTool";
import { ToolErrorCard } from "../ToolErrorCard";
import {
	inputAsRecord,
	isToolError,
	pickString,
	statusFromToolState,
} from "../toolHelpers";

const PATH_KEYS = ["file_path", "filePath", "path", "filename"] as const;
const CONTENT_KEYS = ["content", "text", "body"] as const;

export function WriteTool({ part }: { part: ToolPart }) {
	const input = inputAsRecord(part.state);
	const path = pickString(input, PATH_KEYS) ?? "";
	const content = pickString(input, CONTENT_KEYS) ?? "";

	if (isToolError(part) && part.state.kind === "error") {
		return (
			<ToolErrorCard
				tool="Write"
				error={part.state.error.message}
				subtitle={path || undefined}
			/>
		);
	}

	return (
		<BasicTool
			icon={FilePlus}
			status={statusFromToolState(part.state)}
			defer
			trigger={{
				title: "Write",
				subtitle: path,
				args: content ? [`${content.split(/\r?\n/).length} lines`] : [],
			}}
		>
			<pre
				data-scrollable="true"
				className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed"
			>
				{content}
			</pre>
		</BasicTool>
	);
}
