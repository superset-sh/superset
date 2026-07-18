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
import { useEffect, useState } from "react";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import { PILL_BUTTON_CLASS } from "renderer/components/Chat/ChatInterface/styles";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { typeCommandIntoPty } from "../../typeCommandIntoPty";

interface TerminalComposerControlsProps {
	terminalId: string;
	terminalInstanceId: string;
	/** Detected CLI agent driving the terminal; selects the chip set. */
	agentId: "claude" | "codex";
	/** Model id auto-detected from the agent's session hooks. */
	detectedModel?: string;
	/** Effort level auto-detected from the agent's session hooks. */
	detectedEffort?: string;
}

type AgentControlsProps = Omit<TerminalComposerControlsProps, "agentId">;

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
 * Agent-flavoured composer controls for the terminal rich input, styled
 * after the chat composer's pill row. Selections are not app state — each
 * chip drives the CLI in the PTY and the CLI applies the change itself. The
 * chip set differs per agent because the CLIs differ: Claude Code accepts
 * non-interactive /model and /effort commands (so chips can be pickers),
 * while Codex only offers interactive pickers (so chips open them).
 */
export function TerminalComposerControls({
	agentId,
	...props
}: TerminalComposerControlsProps) {
	if (agentId === "codex") return <CodexComposerControls {...props} />;
	return <ClaudeComposerControls {...props} />;
}

/**
 * Claude Code chips. Each pick submits the corresponding slash command
 * straight into the PTY (bracketed paste + CR, the same path the rich input
 * uses), and Claude Code applies it. Permission modes have no settable
 * command or readable state (Shift+Tab cycling is the CLI's only mid-session
 * mechanism), so that chip sends the cycle keystroke and the terminal
 * displays the resulting mode.
 */
function ClaudeComposerControls({
	terminalId,
	terminalInstanceId,
	detectedModel,
	detectedEffort,
}: AgentControlsProps) {
	const modelOptions = useClaudeModelOptions();
	const [selections, setSelections] = useState(
		() => selectionsByTerminalId.get(terminalId) ?? {},
	);

	// A pick only bridges the gap until the binding reports fresh session
	// config (hooks fire on session start and turn end) — new detected values
	// are ground truth and must invalidate the optimistic label, otherwise a
	// single manual pick would shadow auto-detection for this terminal for
	// the app's lifetime.
	useEffect(() => {
		setSelections((prev) => {
			if (prev.model === undefined && prev.effort === undefined) return prev;
			const next = { ...prev };
			if (detectedModel !== undefined) next.model = undefined;
			if (detectedEffort !== undefined) next.effort = undefined;
			if (next.model === prev.model && next.effort === prev.effort) return prev;
			selectionsByTerminalId.set(terminalId, next);
			return next;
		});
	}, [detectedModel, detectedEffort, terminalId]);

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

/**
 * Display label for detected Codex model ids: "gpt-5.6-terra" → "GPT-5.6
 * Terra". Display-only — model changes go through Codex's own /model picker,
 * so an unrecognized shape safely falls back to the raw id.
 */
function prettifyCodexModelId(modelId: string): string {
	const parts = modelId.split("-");
	if (parts[0] !== "gpt") return modelId;
	const [, version, ...rest] = parts;
	const base = version ? `GPT-${version}` : "GPT";
	const suffix = rest
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
	return suffix ? `${base} ${suffix}` : base;
}

/**
 * Codex chips. Codex has no non-interactive commands for these settings —
 * "/model gpt-5.5 high" as text becomes a chat message, there is no /effort,
 * and Shift+Tab cycles collaboration modes rather than permissions — so
 * every chip opens the CLI's own picker in the terminal by typing the
 * command (Codex ignores bracket-pasted slash commands; see
 * typeCommandIntoPty). Model and effort labels are display-only: both are
 * chosen in the /model picker (effort is its second step), and the session
 * hooks refresh the detected values afterwards.
 */
function CodexComposerControls({
	terminalId,
	terminalInstanceId,
	detectedModel,
	detectedEffort,
}: AgentControlsProps) {
	const codexIcon = usePresetIcon("codex");
	const openModelPicker = () => {
		void typeCommandIntoPty(terminalId, "/model", terminalInstanceId);
	};
	const modelLabel = detectedModel
		? prettifyCodexModelId(detectedModel)
		: "Model";
	const effortLabel = detectedEffort
		? (EFFORT_OPTIONS.find((option) => option.value === detectedEffort)
				?.label ?? detectedEffort)
		: "Effort";

	return (
		<div className="flex items-center gap-1.5">
			<Tooltip>
				<TooltipTrigger asChild>
					<PromptInputButton
						className={`${PILL_BUTTON_CLASS} px-2 gap-1 text-xs text-foreground`}
						onClick={() => {
							void typeCommandIntoPty(
								terminalId,
								"/permissions",
								terminalInstanceId,
							);
						}}
					>
						<ShieldIcon className="size-3.5 opacity-60" />
						<span>Permissions</span>
					</PromptInputButton>
				</TooltipTrigger>
				<TooltipContent side="top">
					Open the permissions picker (/permissions)
				</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<PromptInputButton
						className={`${PILL_BUTTON_CLASS} px-2 gap-1.5 text-xs text-foreground`}
						onClick={openModelPicker}
					>
						{codexIcon && (
							<img alt="Codex" className="size-3" src={codexIcon} />
						)}
						<span>{modelLabel}</span>
					</PromptInputButton>
				</TooltipTrigger>
				<TooltipContent side="top">
					Open Codex's model picker (/model)
				</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<PromptInputButton
						className={`${PILL_BUTTON_CLASS} px-2 gap-1 text-xs text-foreground`}
						onClick={openModelPicker}
					>
						<BrainIcon className="size-3.5 opacity-60" />
						<span>{effortLabel}</span>
					</PromptInputButton>
				</TooltipTrigger>
				<TooltipContent side="top">
					Reasoning effort — chosen in the /model picker
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
