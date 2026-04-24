/**
 * Web fetch / web search / code search tool renderers. Ported from
 * OpenCode's message-part.tsx:1642-1737. Triggers show the URL or
 * query as a clickable link; no collapsible body since most of the
 * useful info is in the subtitle.
 */

import type { ToolPart } from "@superset/chat/shared";
import type { LucideIcon } from "lucide-react";
import { ExternalLink, Globe, Search } from "lucide-react";
import { BasicTool } from "../BasicTool";
import { ToolErrorCard } from "../ToolErrorCard";
import {
	extractShellOutput,
	inputAsRecord,
	isToolError,
	pickString,
	statusFromToolState,
} from "../toolHelpers";

function WebLikeTool({
	part,
	title,
	icon,
	subtitleKeys,
	linkKeys,
}: {
	part: ToolPart;
	title: string;
	icon: LucideIcon;
	subtitleKeys: readonly string[];
	linkKeys: readonly string[];
}) {
	const input = inputAsRecord(part.state);
	const subtitle = pickString(input, subtitleKeys) ?? "";
	const href = pickString(input, linkKeys);

	if (isToolError(part) && part.state.kind === "error") {
		return (
			<ToolErrorCard
				tool={title}
				error={part.state.error.message}
				subtitle={subtitle || href || undefined}
			/>
		);
	}

	const output =
		part.state.kind === "completed" ? extractShellOutput(part.state.output) : "";

	const action = href ? (
		<a
			href={href}
			target="_blank"
			rel="noreferrer noopener"
			className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
			onClick={(e) => e.stopPropagation()}
		>
			<ExternalLink className="size-3" />
			open
		</a>
	) : null;

	// Hide the collapsible body when output is empty (typical for web_fetch
	// where the body is a URL fetch result that may be large; user can
	// expand if they want).
	const hasBody = output.length > 0;

	return (
		<BasicTool
			icon={icon}
			status={statusFromToolState(part.state)}
			defer
			hideDetails={!hasBody}
			trigger={{ title, subtitle, action }}
		>
			{hasBody && (
				<pre
					data-scrollable="true"
					className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]"
				>
					{output}
				</pre>
			)}
		</BasicTool>
	);
}

export function WebFetchTool({ part }: { part: ToolPart }) {
	return (
		<WebLikeTool
			part={part}
			title="Fetch"
			icon={Globe}
			subtitleKeys={["url", "description"]}
			linkKeys={["url"]}
		/>
	);
}

export function WebSearchTool({ part }: { part: ToolPart }) {
	return (
		<WebLikeTool
			part={part}
			title="Web search"
			icon={Search}
			subtitleKeys={["query", "q", "description"]}
			linkKeys={[]}
		/>
	);
}

export function CodeSearchTool({ part }: { part: ToolPart }) {
	return (
		<WebLikeTool
			part={part}
			title="Code search"
			icon={Search}
			subtitleKeys={["query", "q", "pattern"]}
			linkKeys={[]}
		/>
	);
}
