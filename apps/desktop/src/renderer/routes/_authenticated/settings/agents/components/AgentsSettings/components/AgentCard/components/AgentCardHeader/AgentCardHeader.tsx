import type { ResolvedAgentConfig } from "@superset/shared/agent-settings";
import { CardDescription, CardHeader, CardTitle } from "@superset/ui/card";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { ChevronDownIcon } from "lucide-react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";

interface AgentCardHeaderProps {
	preset: ResolvedAgentConfig;
	isOpen: boolean;
	showEnabled: boolean;
	enabled: boolean;
	isUpdatingEnabled: boolean;
	onEnabledChange: (enabled: boolean) => void;
	onToggle: () => void;
}

export function AgentCardHeader({
	preset,
	isOpen,
	showEnabled,
	enabled,
	isUpdatingEnabled,
	onEnabledChange,
	onToggle,
}: AgentCardHeaderProps) {
	const isDark = useIsDarkTheme();
	const icon = getPresetIcon(preset.id, isDark);
	const contentId = `${preset.id}-settings`;

	return (
		<CardHeader
			role="button"
			tabIndex={0}
			aria-expanded={isOpen}
			aria-controls={contentId}
			className="cursor-pointer gap-3 p-4 transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onClick={onToggle}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onToggle();
				}
			}}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					{icon ? (
						<img src={icon} alt="" className="size-8 object-contain" />
					) : (
						<div className="size-8 rounded-lg bg-muted" />
					)}
					<div className="min-w-0">
						<CardTitle className="truncate">{preset.label}</CardTitle>
						<CardDescription className="mt-1">
							{preset.description ?? "Agent launch configuration"}
						</CardDescription>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-3">
					{showEnabled && (
						<div className="flex items-center">
							<Switch
								id={`${preset.id}-enabled`}
								aria-label={`Enable ${preset.label}`}
								checked={enabled}
								disabled={isUpdatingEnabled}
								onCheckedChange={onEnabledChange}
								onClick={(event) => event.stopPropagation()}
								onKeyDown={(event) => event.stopPropagation()}
							/>
						</div>
					)}
					<ChevronDownIcon
						aria-hidden="true"
						className={cn(
							"size-4 text-muted-foreground transition-transform duration-200",
							isOpen && "rotate-180",
						)}
					/>
				</div>
			</div>
		</CardHeader>
	);
}
