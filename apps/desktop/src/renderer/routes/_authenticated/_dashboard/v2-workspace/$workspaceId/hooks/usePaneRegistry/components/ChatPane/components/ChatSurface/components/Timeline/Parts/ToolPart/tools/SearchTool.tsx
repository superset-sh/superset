/**
 * Shared renderer for grep / glob / list tools. Trigger shows the
 * pattern or path; body shows output. OpenCode unifies these behind
 * the same basic template — we follow that pattern.
 */

import type { ToolPart } from "@superset/chat/shared";
import type { LucideIcon } from "lucide-react";
import { FolderTree, Search } from "lucide-react";
import { BasicTool } from "../BasicTool";
import { ToolErrorCard } from "../ToolErrorCard";
import {
	extractShellOutput,
	inputAsRecord,
	isToolError,
	pickString,
	statusFromToolState,
} from "../toolHelpers";

function SearchLikeTool({
	part,
	title,
	icon,
	subtitleKeys,
}: {
	part: ToolPart;
	title: string;
	icon: LucideIcon;
	subtitleKeys: readonly string[];
}) {
	const input = inputAsRecord(part.state);
	const subtitle = pickString(input, subtitleKeys) ?? "";

	if (isToolError(part) && part.state.kind === "error") {
		return (
			<ToolErrorCard
				tool={title}
				error={part.state.error.message}
				subtitle={subtitle || undefined}
			/>
		);
	}

	const output =
		part.state.kind === "completed" ? extractShellOutput(part.state.output) : "";

	return (
		<BasicTool
			icon={icon}
			status={statusFromToolState(part.state)}
			defer
			trigger={{ title, subtitle }}
		>
			<pre
				data-scrollable="true"
				className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]"
			>
				{output}
			</pre>
		</BasicTool>
	);
}

export function GrepTool({ part }: { part: ToolPart }) {
	return (
		<SearchLikeTool
			part={part}
			title="Grep"
			icon={Search}
			subtitleKeys={["pattern", "query", "regex"]}
		/>
	);
}

export function GlobTool({ part }: { part: ToolPart }) {
	return (
		<SearchLikeTool
			part={part}
			title="Glob"
			icon={Search}
			subtitleKeys={["pattern", "glob", "path"]}
		/>
	);
}

export function ListTool({ part }: { part: ToolPart }) {
	return (
		<SearchLikeTool
			part={part}
			title="List"
			icon={FolderTree}
			subtitleKeys={["path", "dir", "directory"]}
		/>
	);
}
