import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@superset/ui/breadcrumb";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Link } from "@tanstack/react-router";
import { LuClock, LuEllipsis, LuPlay, LuTrash2 } from "react-icons/lu";

interface AutomationDetailHeaderProps {
	name: string;
	onDelete: () => void;
	onRunNow: () => void;
	onOpenHistory: () => void;
	deleteDisabled?: boolean;
	runNowDisabled?: boolean;
	/** Disables the actions — they're all owner-gated server-side. */
	readOnly?: boolean;
}

export function AutomationDetailHeader({
	name,
	onDelete,
	onRunNow,
	onOpenHistory,
	deleteDisabled,
	runNowDisabled,
	readOnly,
}: AutomationDetailHeaderProps) {
	return (
		<header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
			<Breadcrumb>
				<BreadcrumbList className="text-sm">
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link to="/automations">Automations</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage className="font-medium">{name}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			{/* Window-drag leaf standing in for the hidden TopBar. */}
			<div className="drag h-full min-w-0 flex-1" />

			<div className="flex items-center gap-1">
				<Tooltip>
					{/* Disabled buttons swallow hover events, so the trigger is a
					    span — otherwise the read-only explanation never shows. */}
					<TooltipTrigger asChild>
						<span className="inline-flex">
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={onOpenHistory}
								disabled={readOnly}
								aria-label="Prompt history"
							>
								<LuClock className="size-4" />
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent>
						{readOnly
							? "Only the owner can view prompt history"
							: "Prompt history"}
					</TooltipContent>
				</Tooltip>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							disabled={readOnly}
							aria-label="More actions"
						>
							<LuEllipsis className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							variant="destructive"
							disabled={deleteDisabled}
							onSelect={onDelete}
						>
							<LuTrash2 className="size-4" />
							Delete automation
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<div className="mx-1 h-4 w-px bg-border" />
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="inline-flex">
							<Button
								variant="outline"
								size="sm"
								className="h-8 gap-1.5 px-3"
								onClick={onRunNow}
								disabled={readOnly || runNowDisabled}
							>
								<LuPlay className="size-4" />
								<span>Run now</span>
							</Button>
						</span>
					</TooltipTrigger>
					{readOnly && (
						<TooltipContent>
							Only the owner can run this automation
						</TooltipContent>
					)}
				</Tooltip>
			</div>
		</header>
	);
}
