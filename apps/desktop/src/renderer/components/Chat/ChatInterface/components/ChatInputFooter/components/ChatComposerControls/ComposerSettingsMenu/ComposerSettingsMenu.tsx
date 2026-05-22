import { ModelSelectorLogo } from "@superset/ui/ai-elements/model-selector";
import { PromptInputButton } from "@superset/ui/ai-elements/prompt-input";
import type { ThinkingLevel } from "@superset/ui/ai-elements/thinking-toggle";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { claudeIcon } from "@superset/ui/icons/preset-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	BrainIcon,
	CheckIcon,
	ChevronRightIcon,
	ShieldCheckIcon,
	ShieldIcon,
	ShieldOffIcon,
} from "lucide-react";
import type React from "react";
import { useRef, useState } from "react";
import { PILL_BUTTON_CLASS } from "renderer/components/Chat/ChatInterface/styles";
import type {
	ModelOption,
	PermissionMode,
} from "renderer/components/Chat/ChatInterface/types";
import {
	ANTHROPIC_LOGO_PROVIDER,
	providerToLogo,
} from "../../../../ModelPicker/utils/providerToLogo";

interface ComposerSettingsMenuProps {
	selectedModel: ModelOption | null;
	setModelSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
	permissionMode: PermissionMode;
	setPermissionMode: React.Dispatch<React.SetStateAction<PermissionMode>>;
	thinkingLevel: ThinkingLevel;
	setThinkingLevel: (level: ThinkingLevel) => void;
}

interface PermissionModeOption {
	value: PermissionMode;
	label: string;
	description: string;
	icon: React.ComponentType<{ className?: string }>;
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
		label: "Semi-auto",
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

interface ThinkingLevelOption {
	value: ThinkingLevel;
	label: string;
	description: string;
}

const THINKING_LEVELS: ThinkingLevelOption[] = [
	{ value: "off", label: "Off", description: "No extended thinking" },
	{ value: "low", label: "Low", description: "Minimal reasoning effort" },
	{
		value: "medium",
		label: "Medium",
		description: "Moderate reasoning effort",
	},
	{ value: "high", label: "High", description: "Thorough reasoning effort" },
	{
		value: "xhigh",
		label: "Max",
		description: "Maximum reasoning effort",
	},
];

export function ComposerSettingsMenu({
	selectedModel,
	setModelSelectorOpen,
	permissionMode,
	setPermissionMode,
	thinkingLevel,
	setThinkingLevel,
}: ComposerSettingsMenuProps) {
	const [menuOpen, setMenuOpen] = useState(false);
	const pendingDialogOpenRef = useRef(false);

	const activePermission =
		PERMISSION_MODES.find((m) => m.value === permissionMode) ??
		PERMISSION_MODES[0];
	const PermissionIcon = activePermission.icon;

	const activeThinking =
		THINKING_LEVELS.find((t) => t.value === thinkingLevel) ??
		THINKING_LEVELS[0];

	const brainIconColor =
		thinkingLevel === "off" ? "text-muted-foreground" : "text-foreground";

	const selectedLogo = selectedModel
		? providerToLogo(selectedModel.provider)
		: null;

	const tooltipText = `Model: ${selectedModel?.name ?? "Model"} · Permission: ${activePermission.label} · Thinking: ${activeThinking.label}`;

	const ariaLabel = `Chat settings: model ${selectedModel?.name ?? "Model"}, permission ${activePermission.label}, thinking ${activeThinking.label}`;

	return (
		<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<PromptInputButton
							className={`${PILL_BUTTON_CLASS} px-2 gap-1 text-xs text-foreground cursor-pointer`}
							aria-label={ariaLabel}
						>
							<PermissionIcon className="size-3.5 text-foreground" />
							{selectedLogo === ANTHROPIC_LOGO_PROVIDER ? (
								<img alt="Claude" className="size-3" src={claudeIcon} />
							) : selectedLogo ? (
								<ModelSelectorLogo provider={selectedLogo} />
							) : null}
							<span className="max-w-[180px] truncate">
								{selectedModel?.name ?? "Model"}
							</span>
							<BrainIcon className={`size-3.5 ${brainIconColor}`} />
						</PromptInputButton>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent>
					<p>{tooltipText}</p>
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				align="start"
				className="w-64"
				onCloseAutoFocus={(event) => {
					if (pendingDialogOpenRef.current) {
						event.preventDefault();
						pendingDialogOpenRef.current = false;
						setModelSelectorOpen(true);
					}
				}}
			>
				<DropdownMenuLabel>Permission</DropdownMenuLabel>
				{PERMISSION_MODES.map((mode) => {
					const Icon = mode.icon;
					const isActive = mode.value === permissionMode;
					return (
						<DropdownMenuItem
							key={mode.value}
							onSelect={() => setPermissionMode(mode.value)}
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

				<DropdownMenuSeparator />

				<DropdownMenuLabel>Thinking</DropdownMenuLabel>
				{THINKING_LEVELS.map((level) => {
					const isActive = level.value === thinkingLevel;
					return (
						<DropdownMenuItem
							key={level.value}
							onSelect={() => setThinkingLevel(level.value)}
							className="flex items-center gap-2"
						>
							<div className="flex flex-1 flex-col gap-0.5">
								<span className="text-sm font-medium">{level.label}</span>
								<span className="text-xs text-muted-foreground">
									{level.description}
								</span>
							</div>
							{isActive && <CheckIcon className="size-4 shrink-0" />}
						</DropdownMenuItem>
					);
				})}

				<DropdownMenuSeparator />

				<div className="p-1">
					<button
						type="button"
						className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-foreground/[0.04] px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-foreground/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						aria-label={`Change model. Current model: ${selectedModel?.name ?? "Model"}`}
						onClick={() => {
							pendingDialogOpenRef.current = true;
							setMenuOpen(false);
						}}
					>
						<span className="flex items-center gap-2 min-w-0">
							{selectedLogo === ANTHROPIC_LOGO_PROVIDER ? (
								<img alt="Claude" className="size-3" src={claudeIcon} />
							) : selectedLogo ? (
								<ModelSelectorLogo provider={selectedLogo} />
							) : null}
							<span className="truncate">{selectedModel?.name ?? "Model"}</span>
						</span>
						<span className="flex items-center gap-0.5 text-muted-foreground">
							Change
							<ChevronRightIcon className="size-3" />
						</span>
					</button>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
