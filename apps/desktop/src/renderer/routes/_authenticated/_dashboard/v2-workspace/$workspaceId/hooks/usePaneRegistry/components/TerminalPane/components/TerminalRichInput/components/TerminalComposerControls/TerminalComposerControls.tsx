import { PromptInputButton } from "@superset/ui/ai-elements/prompt-input";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { claudeIcon } from "@superset/ui/icons/preset-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import {
	BrainIcon,
	CheckIcon,
	ChevronDownIcon,
	ShieldIcon,
} from "lucide-react";
import { useState } from "react";
import { PILL_BUTTON_CLASS } from "renderer/components/Chat/ChatInterface/styles";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import {
	getDesktopChatModelOptions,
	isDesktopChatDevMode,
} from "renderer/lib/dev-chat";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";

interface TerminalComposerControlsProps {
	terminalId: string;
	terminalInstanceId: string;
	/** Model id auto-detected from the agent's session hooks. */
	detectedModel?: string;
	/** Effort level auto-detected from the agent's session hooks. */
	detectedEffort?: string;
}

interface SelectOption {
	value: string;
	label: string;
	description?: string;
}

/**
 * Fallback when the model catalog hasn't loaded: Claude Code aliases, family
 * names only — the CLI resolves an alias to the account's current version, so
 * pinning versions in these labels would go stale.
 */
const FALLBACK_MODEL_OPTIONS: SelectOption[] = [
	{ value: "fable", label: "Fable", description: "Most capable" },
	{ value: "opus", label: "Opus", description: "Deep reasoning" },
	{ value: "sonnet", label: "Sonnet", description: "Balanced" },
	{ value: "haiku", label: "Haiku", description: "Fastest" },
];

const ANTHROPIC_ID_PREFIX = "anthropic/";

/**
 * Model options from the shared chat catalog (same query key as the chat
 * composer, so the fetch is deduped and new models arrive with the catalog —
 * nothing hardcoded). Catalog ids are gateway-style ("anthropic/claude-x");
 * the bare id after the prefix is a valid `/model` argument, and the catalog
 * name ("Opus 4.8") becomes the label.
 */
function useModelOptions(): SelectOption[] {
	const localModels = getDesktopChatModelOptions();
	const { data } = useQuery({
		queryKey: ["chat", "models"],
		queryFn: () => apiTrpcClient.chat.getModels.query(),
		enabled: !isDesktopChatDevMode(),
		staleTime: Number.POSITIVE_INFINITY,
	});
	const catalog = localModels.length > 0 ? localModels : (data?.models ?? []);
	const options = catalog
		.filter((model) => model.id.startsWith(ANTHROPIC_ID_PREFIX))
		.map((model) => ({
			value: model.id.slice(ANTHROPIC_ID_PREFIX.length),
			label: model.name,
		}));
	return options.length > 0 ? options : FALLBACK_MODEL_OPTIONS;
}

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
 * Session hooks report model/effort at session start (the detected props);
 * these picks cover the gap between sending a /model or /effort command and
 * the next hook event, since Claude Code emits none on mid-session changes.
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
	detectedModel,
	detectedEffort,
}: TerminalComposerControlsProps) {
	const modelOptions = useModelOptions();
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

	// A pick from the chips wins until the next session hook updates the
	// binding; otherwise the auto-detected session config drives the labels.
	const effectiveModel = selections.model ?? detectedModel;
	const effectiveEffort = selections.effort ?? detectedEffort;
	const selectedModel = modelOptions.find(
		(option) => option.value === effectiveModel,
	);
	const selectedEffort = EFFORT_OPTIONS.find(
		(option) => option.value === effectiveEffort,
	);
	// Detected values may not be in the catalog (e.g. an alias or a model
	// newer than the catalog) — fall back to showing the raw value.
	const modelLabel = selectedModel?.label ?? effectiveModel ?? "Model";
	const effortLabel = selectedEffort?.label ?? effectiveEffort ?? "Effort";

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
						<span>{modelLabel}</span>
						<ChevronDownIcon className="size-2.5 opacity-50" />
					</PromptInputButton>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-56">
					{modelOptions.map((option) => (
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
								{option.description && (
									<span className="text-xs text-muted-foreground">
										{option.description}
									</span>
								)}
							</div>
							{option.value === effectiveModel && (
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
						<span>{effortLabel}</span>
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
							{option.value === effectiveEffort && (
								<CheckIcon className="size-4 shrink-0" />
							)}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
