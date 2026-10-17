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
import { useState } from "react";
import { PluginIcon } from "renderer/components/PluginIcon";
import { usePluginMentionOptions } from "renderer/hooks/usePluginMentionOptions";
import { toolTitle } from "../../utils/toolTitle";
import { ToolContentList } from "../ToolContentList";
import { FileChangeTitle } from "./components/FileChangeTitle";
import { ShellIntentTitle } from "./components/ShellIntentTitle";
import { StatusWord } from "./components/StatusWord";

const TITLE_SWEEP_SECONDS = 1.6;

/**
 * One line per call on a rail of steps: what the agent did, a command in
 * mono, a file as a chip that previews its edit, a shell command that only
 * read or searched as that read or search. A running call turns a
 * dashed ring and sweeps its title; a settled one recedes. The line opens
 * what the call produced: a button under the whole row toggles it, so the
 * chip can be a button of its own without one inside the other.
 */
export function ToolCallRow({ item }: { item: ToolCall }) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const hasBody = item.content.length > 0;
	const running = item.status === "running";
	const installedPlugins = usePluginMentionOptions();
	const mcpServer = item.mcpServer;
	const plugin = mcpServer
		? installedPlugins.find((candidate) => candidate.name === mcpServer.name)
		: undefined;
	const toggle = hasBody ? () => setOpen((value) => !value) : undefined;

	const { change, command, intent, label } = toolTitle(
		item,
		t,
		Boolean(plugin),
	);
	let title: ReactNode;
	if (change) {
		title = (
			<FileChangeTitle
				change={change}
				item={item}
				onToggle={toggle}
				running={running}
				verb={label}
			/>
		);
	} else if (intent) {
		title = <ShellIntentTitle intent={intent} running={running} verb={label} />;
	} else {
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
			<div
				className={cn(
					"group/tool relative flex w-full min-w-0 items-center gap-1.5 py-1 font-sans text-sm transition-colors duration-200",
					running ? "text-muted-foreground" : "text-foreground/50",
					hasBody && !running && "hover:text-foreground/80",
				)}
			>
				<CollapsibleTrigger
					aria-label={item.title}
					className="absolute inset-0 rounded focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-1px]"
					disabled={!hasBody}
				/>
				<div className="pointer-events-none relative z-[1] flex min-w-0 flex-1 items-center gap-1.5">
					{running ? (
						<CircleDashed
							className="size-3.5 shrink-0 animate-spin-slow text-foreground/40 motion-reduce:animate-none"
							strokeWidth={1.75}
						/>
					) : (
						plugin && (
							<PluginIcon
								className="size-3.5 rounded-sm"
								pluginName={plugin.name}
							/>
						)
					)}
					<span
						className="flex min-w-0 items-center gap-1.5"
						data-find-item={item.id}
					>
						{title}
					</span>
					<StatusWord status={item.status} />
					{hasBody && (
						<ChevronRight
							className={cn(
								"size-3 shrink-0 text-foreground/45 opacity-0 transition group-focus-within/tool:opacity-100 group-hover/tool:opacity-100",
								open && "rotate-90 opacity-100",
							)}
						/>
					)}
				</div>
			</div>
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
