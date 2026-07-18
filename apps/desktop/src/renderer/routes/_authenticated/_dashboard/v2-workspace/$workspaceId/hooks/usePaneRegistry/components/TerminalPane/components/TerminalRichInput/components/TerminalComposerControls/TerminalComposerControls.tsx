import { PromptInputButton } from "@superset/ui/ai-elements/prompt-input";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { claudeIcon } from "@superset/ui/icons/preset-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	BrainIcon,
	CheckIcon,
	ChevronDownIcon,
	ShieldIcon,
} from "lucide-react";
import { useState } from "react";
import { PILL_BUTTON_CLASS } from "renderer/components/Chat/ChatInterface/styles";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";

interface TerminalComposerControlsProps {
	terminalId: string;
	terminalInstanceId: string;
}

interface SelectOption {
	value: string;
	label: string;
	description: string;
}

/**
 * Claude Code model aliases (`/model <alias>`), family names only — the CLI
 * resolves an alias to the account's current version, so pinning versions in
 * labels here would go stale.
 */
const MODEL_OPTIONS: SelectOption[] = [
	{ value: "fable", label: "Fable", description: "Most capable" },
	{ value: "opus", label: "Opus", description: "Deep reasoning" },
	{ value: "sonnet", label: "Sonnet", description: "Balanced" },
	{ value: "haiku", label: "Haiku", description: "Fastest" },
];

/** Claude Code `/effort <level>` values; `auto` resets to the model default. */
const EFFORT_OPTIONS: SelectOption[] = [
	{ value: "auto", label: "Auto", description: "Model default" },
	{ value: "low", label: "Low", description: "Minimal reasoning" },
	{ value: "medium", label: "Medium", description: "Moderate reasoning" },
	{ value: "high", label: "High", description: "Thorough reasoning" },
	{ value: "xhigh", label: "XHigh", description: "Extra-thorough reasoning" },
	{ value: "max", label: "Max", description: "Maximum reasoning" },
];

/**
 * Last-sent selections keyed by terminalId, module-scoped so the optimistic
 * labels survive the pane being re-pointed at another terminal and back.
 * Claude Code has no readable mid-session state surface (statusline sync is
 * a future enhancement), so the chips show what was last sent from here —
 * "Model"/"Effort" until first use — and the terminal itself remains the
 * source of truth.
 */
const selectionsByTerminalId = new Map<
	string,
	{ model?: string; effort?: string }
>();

/**
 * Claude-flavoured composer controls for the terminal rich input, styled
 * after the chat composer's pill row. Selections are not app state — each
 * pick submits the corresponding slash command straight into the PTY
 * (bracketed paste + CR, the same path the rich input uses), and Claude Code
 * applies it. Permission modes have no settable command or readable state
 * (Shift+Tab cycling is the CLI's only mid-session mechanism), so that chip
 * sends the cycle keystroke and the terminal displays the resulting mode.
 */
export function TerminalComposerControls({
	terminalId,
	terminalInstanceId,
}: TerminalComposerControlsProps) {
	const [selections, setSelections] = useState(
		() => selectionsByTerminalId.get(terminalId) ?? {},
	);

	const sendCommand = (command: string) => {
		terminalRuntimeRegistry.paste(terminalId, command, terminalInstanceId);
		terminalRuntimeRegistry.writeInput(terminalId, "\r", terminalInstanceId);
	};

	const updateSelection = (patch: { model?: string; effort?: string }) => {
		const next = { ...selectionsByTerminalId.get(terminalId), ...patch };
		selectionsByTerminalId.set(terminalId, next);
		setSelections(next);
	};

	const selectedModel = MODEL_OPTIONS.find(
		(option) => option.value === selections.model,
	);
	const selectedEffort = EFFORT_OPTIONS.find(
		(option) => option.value === selections.effort,
	);

	return (
		<div className="flex items-center gap-1.5">
			<Tooltip>
				<TooltipTrigger asChild>
					<PromptInputButton
						className={`${PILL_BUTTON_CLASS} px-2 gap-1 text-xs text-foreground`}
						onClick={() =>
							// Shift+Tab (CSI Z): Claude Code's permission-mode cycle.
							terminalRuntimeRegistry.writeInput(
								terminalId,
								"\x1b[Z",
								terminalInstanceId,
							)
						}
					>
						<ShieldIcon className="size-3.5 opacity-60" />
						<span>Mode</span>
					</PromptInputButton>
				</TooltipTrigger>
				<TooltipContent side="top">
					Cycle permission mode (Shift+Tab) — shown in the terminal
				</TooltipContent>
			</Tooltip>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<PromptInputButton
						className={`${PILL_BUTTON_CLASS} px-2 gap-1.5 text-xs text-foreground`}
					>
						<img alt="Claude" className="size-3" src={claudeIcon} />
						<span>{selectedModel?.label ?? "Model"}</span>
						<ChevronDownIcon className="size-2.5 opacity-50" />
					</PromptInputButton>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-56">
					{MODEL_OPTIONS.map((option) => (
						<DropdownMenuItem
							key={option.value}
							onClick={() => {
								sendCommand(`/model ${option.value}`);
								updateSelection({ model: option.value });
							}}
							className="flex items-center gap-2"
						>
							<div className="flex flex-1 flex-col gap-0.5">
								<span className="text-sm font-medium">{option.label}</span>
								<span className="text-xs text-muted-foreground">
									{option.description}
								</span>
							</div>
							{option.value === selections.model && (
								<CheckIcon className="size-4 shrink-0" />
							)}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<PromptInputButton
						className={`${PILL_BUTTON_CLASS} px-2 gap-1 text-xs text-foreground`}
					>
						<BrainIcon className="size-3.5 opacity-60" />
						<span>{selectedEffort?.label ?? "Effort"}</span>
						<ChevronDownIcon className="size-2.5 opacity-50" />
					</PromptInputButton>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-56">
					{EFFORT_OPTIONS.map((option) => (
						<DropdownMenuItem
							key={option.value}
							onClick={() => {
								sendCommand(`/effort ${option.value}`);
								updateSelection({ effort: option.value });
							}}
							className="flex items-center gap-2"
						>
							<div className="flex flex-1 flex-col gap-0.5">
								<span className="text-sm font-medium">{option.label}</span>
								<span className="text-xs text-muted-foreground">
									{option.description}
								</span>
							</div>
							{option.value === selections.effort && (
								<CheckIcon className="size-4 shrink-0" />
							)}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
