import { PromptInputButton } from "@superset/ui/ai-elements/prompt-input";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { LucideIcon } from "lucide-react";
import {
	CheckIcon,
	ChevronDownIcon,
	ShieldCheckIcon,
	ShieldIcon,
	ShieldOffIcon,
} from "lucide-react";
import type { PermissionMode } from "../../types";

interface PermissionModeOption {
	value: PermissionMode;
	label: string;
	description: string;
	icon: LucideIcon;
}

const PERMISSION_MODES: PermissionModeOption[] = [
	{
		value: "bypassPermissions",
		label: "Auto",
		description: "Tools run without approval",
		icon: ShieldOffIcon,
	},
	{
		value: "acceptEdits",
		label: "Auto-edit",
		description: "Edits auto-approved, others need approval",
		icon: ShieldCheckIcon,
	},
	{
		value: "default",
		label: "Manual",
		description: "All tools require approval",
		icon: ShieldIcon,
	},
];

export function PermissionModePicker({
	selectedMode,
	onSelectMode,
}: {
	selectedMode: PermissionMode;
	onSelectMode: (mode: PermissionMode) => void;
}) {
	const active =
		PERMISSION_MODES.find((m) => m.value === selectedMode) ??
		PERMISSION_MODES[0];
	const ActiveIcon = active.icon;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<PromptInputButton className="gap-1 text-xs">
					<ActiveIcon className="size-3.5 shrink-0" />
					<span className="hidden @xs:inline">{active.label}</span>
					<ChevronDownIcon className="size-3 hidden @xs:block" />
				</PromptInputButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				{PERMISSION_MODES.map((mode) => {
					const Icon = mode.icon;
					const isActive = mode.value === selectedMode;
					return (
						<DropdownMenuItem
							key={mode.value}
							onClick={() => onSelectMode(mode.value)}
							className="flex items-center gap-2"
						>
							<Icon className="size-4 shrink-0" />
							<div className="flex flex-1 flex-col gap-0.5">
								<span className="text-sm font-medium">{mode.label}</span>
								<span className="text-xs text-muted-foreground">
									{mode.description}
								</span>
							</div>
							{isActive && <CheckIcon className="size-4 shrink-0" />}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
