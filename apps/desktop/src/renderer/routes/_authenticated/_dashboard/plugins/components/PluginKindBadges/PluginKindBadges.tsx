import {
	getPluginComponentKinds,
	type PluginCatalogEntry,
	type PluginComponentKind,
} from "@superset/shared/plugins";
import { Badge } from "@superset/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";

const COMPONENT_KIND_LABELS: Record<
	PluginComponentKind,
	{ label: string; tooltip: string }
> = {
	mcp: { label: "MCP", tooltip: "Remote MCP server — connects over HTTP" },
	cli: { label: "CLI", tooltip: "Runs a local command on your machine" },
	skills: { label: "Skill", tooltip: "Adds skills to your agents" },
};

export function PluginKindBadges({ plugin }: { plugin: PluginCatalogEntry }) {
	return (
		<>
			{getPluginComponentKinds(plugin).map((kind) => (
				<Tooltip key={kind} delayDuration={300}>
					<TooltipTrigger asChild>
						<Badge
							variant="outline"
							className="h-4 shrink-0 rounded px-1 text-[9px] font-medium tracking-wide text-muted-foreground uppercase"
						>
							{COMPONENT_KIND_LABELS[kind].label}
						</Badge>
					</TooltipTrigger>
					<TooltipContent>{COMPONENT_KIND_LABELS[kind].tooltip}</TooltipContent>
				</Tooltip>
			))}
		</>
	);
}
