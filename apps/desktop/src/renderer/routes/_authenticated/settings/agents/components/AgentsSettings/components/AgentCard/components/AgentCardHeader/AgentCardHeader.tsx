import { Badge } from "@superset/ui/badge";
import { CardDescription, CardHeader, CardTitle } from "@superset/ui/card";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import type { ResolvedAgentConfig } from "shared/utils/agent-settings";

interface AgentCardHeaderProps {
	preset: ResolvedAgentConfig;
}

export function AgentCardHeader({ preset }: AgentCardHeaderProps) {
	const isDark = useIsDarkTheme();
	const icon = getPresetIcon(preset.id, isDark);

	return (
		<CardHeader>
			<div className="flex items-center gap-3">
				{icon ? (
					<img src={icon} alt="" className="size-8 object-contain" />
				) : (
					<div className="size-8 rounded-lg bg-muted" />
				)}
				<div className="min-w-0">
					<CardTitle className="truncate">{preset.label}</CardTitle>
					<CardDescription className="mt-1">
						{preset.kind === "chat"
							? "Chat launch configuration"
							: "Terminal launch configuration"}
					</CardDescription>
				</div>
			</div>
			{preset.overriddenFields.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{preset.overriddenFields.map((field) => (
						<Badge key={field} variant="secondary">
							{field}
						</Badge>
					))}
				</div>
			)}
		</CardHeader>
	);
}
