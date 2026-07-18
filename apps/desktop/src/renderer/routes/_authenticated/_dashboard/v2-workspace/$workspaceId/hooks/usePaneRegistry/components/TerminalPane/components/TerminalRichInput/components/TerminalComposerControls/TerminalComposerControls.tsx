import { PromptInputButton } from "@superset/ui/ai-elements/prompt-input";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { claudeIcon } from "@superset/ui/icons/preset-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
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

interface ModelOptionEntry extends SelectOption {
	/** Matches auto-detected model ids from session hooks to this option. */
	detect: RegExp;
}

const FAMILY_DESCRIPTIONS: Record<string, string> = {
	opus: "Best for everyday, complex tasks",
	fable: "Most capable for the hardest tasks",
	sonnet: "Efficient for routine tasks",
	haiku: "Fastest for quick answers",
};

/**
 * Offline fallback mirroring Claude Code's /model picker. Alias values are
 * resolved by the CLI itself, so a stale label can never select the wrong
 * model. The live list (below) replaces this whenever the Anthropic models
 * API is reachable with the user's Claude credentials.
 */
const FALLBACK_MODEL_OPTIONS: ModelOptionEntry[] = [
	{
		value: "opus",
		label: "Opus 4.8",
		description: FAMILY_DESCRIPTIONS.opus,
		detect: /^claude-opus-4-8/,
	},
	{
		value: "fable",
		label: "Fable 5",
		description: FAMILY_DESCRIPTIONS.fable,
		detect: /^claude-fable-5/,
	},
	{
		value: "sonnet",
		label: "Sonnet 5",
		description: FAMILY_DESCRIPTIONS.sonnet,
		detect: /^claude-sonnet-5/,
	},
	{
		value: "haiku",
		label: "Haiku 4.5",
		description: FAMILY_DESCRIPTIONS.haiku,
		detect: /^claude-haiku-4-5/,
	},
];

/**
 * Model options from the Anthropic /v1/models API (latest release per
 * family, fetched host-side with the user's Claude credentials) — new
 * releases show up without a code change. Option values are exact model
 * ids, which /model accepts directly. Falls back to the static picker
 * mirror when no credentials are available or the request fails.
 */
function useClaudeModelOptions(): ModelOptionEntry[] {
	const { data } = workspaceTrpc.chat.listClaudeModels.useQuery(undefined, {
		staleTime: 30 * 60 * 1000,
		retry: 1,
	});
	if (!data || data.length === 0) return FALLBACK_MODEL_OPTIONS;
	return data.map((model) => ({
		value: model.id,
		label: model.label,
		description: FAMILY_DESCRIPTIONS[model.family],
		detect: new RegExp(`^${model.id}`),
	}));
}

/**
 * Fallback display for detected model ids outside MODEL_OPTIONS (older
 * versions, future releases): "claude-sonnet-4-6" → "Sonnet 4.6". Numeric
 * date suffixes (snapshot ids) are dropped.
 */
function prettifyModelId(modelId: string): string {
	const parts = modelId
		.replace(/^claude-/, "")
		.split("-")
		.filter((part) => !/^\d{8}$/.test(part));
	const family = parts[0] ?? modelId;
	const version = parts.slice(1).join(".");
	const familyLabel = family.charAt(0).toUpperCase() + family.slice(1);
	return version ? `${familyLabel} ${version}` : familyLabel;
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
	const modelOptions = useClaudeModelOptions();
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
	// Picks store alias values; detected values are full model ids matched
	// via each option's detect pattern, with a prettified id as fallback for
	// versions outside the current picker lineup.
	const selectedModel = selections.model
		? modelOptions.find((option) => option.value === selections.model)
		: detectedModel
			? modelOptions.find((option) => option.detect.test(detectedModel))
			: undefined;
	const modelLabel =
		selectedModel?.label ??
		(detectedModel ? prettifyModelId(detectedModel) : "Model");
	const effectiveEffort = selections.effort ?? detectedEffort;
	const selectedEffort = EFFORT_OPTIONS.find(
		(option) => option.value === effectiveEffort,
	);
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
							{option.value === selectedModel?.value && (
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
