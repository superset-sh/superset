import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@superset/ui/breadcrumb";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuClock, LuPause, LuPlay, LuTrash2 } from "react-icons/lu";

interface AutomationDetailHeaderProps {
	name: string;
	enabled: boolean;
	onBack: () => void;
	onToggleEnabled: () => void;
	onDelete: () => void;
	onRunNow: () => void;
	onOpenHistory: () => void;
	toggleDisabled?: boolean;
	deleteDisabled?: boolean;
	runNowDisabled?: boolean;
}

export function AutomationDetailHeader({
	name,
	enabled,
	onBack,
	onToggleEnabled,
	onDelete,
	onRunNow,
	onOpenHistory,
	toggleDisabled,
	deleteDisabled,
	runNowDisabled,
}: AutomationDetailHeaderProps) {
	return (
		<header className="flex items-center justify-between border-b px-8 py-4">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink onClick={onBack} className="cursor-pointer">
							Automations
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>{name}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<div className="flex items-center gap-2">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={onOpenHistory}
							aria-label="Version history"
						>
							<LuClock className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Version history</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={onToggleEnabled}
							disabled={toggleDisabled}
							aria-label={enabled ? "Pause" : "Resume"}
						>
							{enabled ? (
								<LuPause className="size-4" />
							) : (
								<LuPlay className="size-4" />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>{enabled ? "Pause" : "Resume"}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={onDelete}
							disabled={deleteDisabled}
							aria-label="Delete"
						>
							<LuTrash2 className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Delete</TooltipContent>
				</Tooltip>
				<Button size="sm" onClick={onRunNow} disabled={runNowDisabled}>
					<LuPlay className="size-4" />
					Run now
				</Button>
			</div>
		</header>
	);
}
