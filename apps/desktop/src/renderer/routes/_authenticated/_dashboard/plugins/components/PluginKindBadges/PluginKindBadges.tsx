import { useLingui } from "@lingui/react/macro";
import {
	getPluginComponentKinds,
	type PluginCatalogEntry,
	type PluginComponentKind,
} from "@superset/shared/plugins";
import { Badge } from "@superset/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";

export function PluginKindBadges({ plugin }: { plugin: PluginCatalogEntry }) {
	const { t } = useLingui();
	const componentKindLabels: Record<
		PluginComponentKind,
		{ label: string; tooltip: string }
	> = {
		mcp: {
			label: t({ message: "MCP" }),
			tooltip: t({
				message: "Remote MCP server — connects over HTTP",
			}),
		},
		cli: {
			label: t({ message: "CLI" }),
			tooltip: t({
				message: "Runs a local command on your machine",
			}),
		},
		skills: {
			label: t({ message: "Skill" }),
			tooltip: t({
				message: "Adds skills to your agents",
			}),
		},
	};
	return (
		<>
			{getPluginComponentKinds(plugin).map((kind) => (
				<Tooltip key={kind} delayDuration={300}>
					<TooltipTrigger asChild>
						<Badge
							variant="outline"
							className="h-4 shrink-0 rounded px-1 text-[9px] font-medium tracking-wide text-muted-foreground uppercase"
						>
							{componentKindLabels[kind].label}
						</Badge>
					</TooltipTrigger>
					<TooltipContent>{componentKindLabels[kind].tooltip}</TooltipContent>
				</Tooltip>
			))}
		</>
	);
}
