import { useLingui } from "@lingui/react/macro";
import type { ToolCall } from "@superset/chat/protocol";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { ChevronRight, CircleDashed } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { PluginIcon } from "renderer/components/PluginIcon";
import { usePluginMentionOptions } from "renderer/hooks/usePluginMentionOptions";
import { fileChangeOf } from "../../utils/fileChange";
import { toolKindIcon } from "../../utils/toolKindIcon";
import { ToolContentList } from "../ToolContentList";
import { FileChangeTitle } from "./components/FileChangeTitle";
import { StatusWord } from "./components/StatusWord";

const TITLE_SWEEP_SECONDS = 1.6;

/**
 * One line per call: what the agent did, a command in mono, a file as a chip.
 * A running call turns a dashed ring and sweeps its title; a settled one
 * recedes. The line opens what the call produced. On a rail of steps the rail
 * is the bullet, so a `bare` row drops its kind icon but keeps a plugin's.
 */
export function ToolCallRow({
	bare = false,
	item,
}: {
	item: ToolCall;
	bare?: boolean;
}) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const hasBody = item.content.length > 0;
	const Icon = toolKindIcon(item.toolKind);
	const running = item.status === "running";
	const command = item.toolKind === "execute";
	const change = useMemo(() => fileChangeOf(item), [item]);
	const installedPlugins = usePluginMentionOptions();
	const mcpServer = item.mcpServer;
	const plugin = mcpServer
		? installedPlugins.find((candidate) => candidate.name === mcpServer.name)
		: undefined;

	let title: ReactNode;
	if (change) {
		title = <FileChangeTitle change={change} item={item} running={running} />;
	} else {
		// The translator names a command "Terminal" until the command itself
		// arrives a beat later; "Running" says more in the meantime.
		const rawMcpTitle =
			!item.title ||
			item.title.startsWith("mcp__") ||
			item.title === `${mcpServer?.tool} (${mcpServer?.name})`;
		const label =
			plugin && mcpServer && rawMcpTitle
				? mcpServer.tool
				: running && command && item.title === "Terminal"
					? t({ message: "Running" })
					: item.title;
		const face = command ? "font-mono text-[13px]" : undefined;
		title = running ? (
			<span className="min-w-0 truncate">
				<ShimmerLabel
					className={cn("font-normal", face)}
					duration={TITLE_SWEEP_SECONDS}
				>
					{label}
				</ShimmerLabel>
			</span>
		) : (
			<span className={cn("min-w-0 truncate", face)}>{label}</span>
		);
	}

	return (
		<Collapsible onOpenChange={setOpen} open={hasBody && open}>
			<CollapsibleTrigger
				className={cn(
					"group/tool flex w-full min-w-0 items-center gap-1.5 py-1 text-left font-sans text-sm transition-colors duration-200",
					running
						? "text-muted-foreground"
						: "text-foreground/50 enabled:hover:text-foreground/80",
				)}
				disabled={!hasBody}
			>
				{running ? (
					<CircleDashed
						className="size-3.5 shrink-0 animate-spin-slow text-foreground/40 motion-reduce:animate-none"
						strokeWidth={1.75}
					/>
				) : plugin ? (
					<PluginIcon
						className="size-3.5 rounded-sm"
						pluginName={plugin.name}
					/>
				) : bare ? null : (
					<Icon className="size-3.5 shrink-0 text-foreground/45" />
				)}
				<span className="flex min-w-0 items-center gap-1.5">{title}</span>
				<StatusWord status={item.status} />
				{hasBody && (
					<ChevronRight
						className={cn(
							"size-3 shrink-0 text-foreground/45 opacity-0 transition group-hover/tool:opacity-100",
							open && "rotate-90 opacity-100",
						)}
					/>
				)}
			</CollapsibleTrigger>
			{hasBody && (
				<CollapsibleContent>
					<div className="mt-1 mb-2 ml-[7px] flex flex-col gap-2 border-border/60 border-l pl-3">
						<ToolContentList
							itemId={item.id}
							items={item.content}
							streaming={running}
						/>
					</div>
				</CollapsibleContent>
			)}
		</Collapsible>
	);
}
