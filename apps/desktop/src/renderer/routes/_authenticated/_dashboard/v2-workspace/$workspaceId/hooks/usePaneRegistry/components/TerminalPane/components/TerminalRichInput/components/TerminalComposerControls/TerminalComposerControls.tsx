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
import { driveCodexModelPicker } from "../../driveCodexModelPicker";
import { planCodexPickerSelection } from "../../planCodexPickerSelection";
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
	/** Live permission/approval mode from the agent's session hooks. */
	detectedPermissionMode?: string;
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
 * Chip labels for detected permission modes, in each CLI's own terminology
 * (the chat composer's Auto/Semi-auto naming is a different product surface).
 * Unknown values prettify rather than hide — the mode string is still truth.
 */
const PERMISSION_MODE_LABELS: Record<string, string> = {
	// Claude Code
	default: "Default",
	acceptEdits: "Accept Edits",
	plan: "Plan",
	bypassPermissions: "Bypass",
	dontAsk: "Don't Ask",
	// Codex sandbox/approval presets
	"read-only": "Read Only",
	"workspace-write": "Agent",
	"danger-full-access": "Full Access",
	"on-request": "Ask",
	untrusted: "Untrusted",
	never: "Full Access",
	auto: "Auto",
};

function permissionModeLabel(mode: string | undefined): string | undefined {
	if (!mode) return undefined;
	const known = PERMISSION_MODE_LABELS[mode];
	if (known) return known;
	// "some-mode" / "someMode" → "Some Mode"
	return mode
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.split(/[-_\s]+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

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
 * Optimistic model/effort labels for one terminal's chips. A pick only
 * bridges the gap until the binding reports fresh session config (hooks fire
 * on session start and turn end) — new detected values are ground truth and
 * must invalidate the optimistic label, otherwise a single manual pick would
 * shadow auto-detection for this terminal for the app's lifetime.
 */
function useOptimisticSelections(
	terminalId: string,
	detectedModel: string | undefined,
	detectedEffort: string | undefined,
) {
	const [selections, setSelections] = useState(
		() => selectionsByTerminalId.get(terminalId) ?? {},
	);

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

	const updateSelection = (patch: { model?: string; effort?: string }) => {
		const next = { ...selectionsByTerminalId.get(terminalId), ...patch };
		selectionsByTerminalId.set(terminalId, next);
		setSelections(next);
	};

	return { selections, updateSelection };
}

/**
 * Agent-flavoured composer controls for the terminal rich input, styled
 * after the chat composer's pill row. Selections are not app state — each
 * chip drives the CLI in the PTY and the CLI applies the change itself. The
 * mechanism differs per agent because the CLIs differ: Claude Code accepts
 * non-interactive /model and /effort commands (a pick submits one), while
 * Codex only has an interactive /model picker — its digit-driven rows let a
 * pick drive the picker with scripted keystrokes (driveCodexModelPicker).
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
	detectedPermissionMode,
}: AgentControlsProps) {
	const modelOptions = useClaudeModelOptions();
	const { selections, updateSelection } = useOptimisticSelections(
		terminalId,
		detectedModel,
		detectedEffort,
	);

	const sendCommand = (command: string) => {
		terminalRuntimeRegistry.paste(terminalId, command, terminalInstanceId);
		terminalRuntimeRegistry.writeInput(terminalId, "\r", terminalInstanceId);
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
						<span>{permissionModeLabel(detectedPermissionMode) ?? "Mode"}</span>
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

/** Chip labels for Codex reasoning levels (picker rows say "Extra high"). */
const CODEX_EFFORT_LABELS: Record<string, string> = {
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "XHigh",
	max: "Max",
	ultra: "Ultra",
};

/**
 * Codex model lineup from the host (Codex's own models cache / `codex debug
 * models`), in the CLI's /model picker row order — the driver depends on
 * that order to pick by row number. Empty while loading or when the host
 * can't reach either source; the chips then fall back to opening the picker.
 */
function useCodexModelOptions() {
	const { data } = workspaceTrpc.chat.listCodexModels.useQuery(undefined, {
		staleTime: 30 * 60 * 1000,
		retry: 1,
	});
	return data ?? [];
}

/**
 * Codex chips. Codex has no non-interactive commands for these settings —
 * "/model gpt-5.5 high" as text becomes a chat message and there is no
 * /effort — but its /model picker is digit-driven, so a dropdown pick can
 * drive the picker itself (see driveCodexModelPicker). The picker always
 * sets model AND effort in one pass, so a model pick re-asserts the current
 * effort (or the target model's default when unsupported) and an effort pick
 * re-asserts the current model. When the model list is unavailable, or the
 * current model can't be resolved for the effort menu, the chips fall back
 * to opening the picker in the terminal (Codex ignores bracket-pasted slash
 * commands; see typeCommandIntoPty). Shift+Tab cycles collaboration modes
 * rather than permissions, so the Permissions chip opens /permissions.
 */
function CodexComposerControls({
	terminalId,
	terminalInstanceId,
	detectedModel,
	detectedEffort,
	detectedPermissionMode,
}: AgentControlsProps) {
	const codexIcon = usePresetIcon("codex");
	const models = useCodexModelOptions();
	const { selections, updateSelection } = useOptimisticSelections(
		terminalId,
		detectedModel,
		detectedEffort,
	);

	const currentModel = selections.model
		? models.find((model) => model.id === selections.model)
		: detectedModel
			? models.find((model) => model.id === detectedModel)
			: undefined;
	const modelLabel =
		currentModel?.label ??
		(detectedModel ? prettifyCodexModelId(detectedModel) : "Model");
	const effectiveEffort = selections.effort ?? detectedEffort;
	const effortLabel = effectiveEffort
		? (CODEX_EFFORT_LABELS[effectiveEffort] ?? effectiveEffort)
		: "Effort";

	const openModelPicker = () => {
		void typeCommandIntoPty(terminalId, "/model", terminalInstanceId);
	};

	const pickModel = (modelId: string) => {
		const target = models.find((model) => model.id === modelId);
		if (!target) return;
		const effort =
			effectiveEffort &&
			target.supportedReasoningLevels.some(
				(level) => level.effort === effectiveEffort,
			)
				? effectiveEffort
				: target.defaultReasoningLevel;
		const plan = planCodexPickerSelection(models, modelId, effort);
		if (!plan) return;
		void driveCodexModelPicker(terminalId, plan, terminalInstanceId);
		updateSelection({ model: modelId, effort });
	};

	const pickEffort = (effort: string) => {
		if (!currentModel) return;
		const plan = planCodexPickerSelection(models, currentModel.id, effort);
		if (!plan) return;
		void driveCodexModelPicker(terminalId, plan, terminalInstanceId);
		updateSelection({ model: currentModel.id, effort });
	};

	const modelChip = (
		<PromptInputButton
			className={`${PILL_BUTTON_CLASS} px-2 gap-1.5 text-xs text-foreground`}
			onClick={models.length === 0 ? openModelPicker : undefined}
		>
			{codexIcon && <img alt="Codex" className="size-3" src={codexIcon} />}
			<span>{modelLabel}</span>
			{models.length > 0 && <ChevronDownIcon className="size-2.5 opacity-50" />}
		</PromptInputButton>
	);

	const effortChip = (
		<PromptInputButton
			className={`${PILL_BUTTON_CLASS} px-2 gap-1 text-xs text-foreground`}
			onClick={currentModel === undefined ? openModelPicker : undefined}
		>
			<BrainIcon className="size-3.5 opacity-60" />
			<span>{effortLabel}</span>
			{currentModel !== undefined && (
				<ChevronDownIcon className="size-2.5 opacity-50" />
			)}
		</PromptInputButton>
	);

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
						<span>
							{permissionModeLabel(detectedPermissionMode) ?? "Permissions"}
						</span>
					</PromptInputButton>
				</TooltipTrigger>
				<TooltipContent side="top">
					Open the permissions picker (/permissions)
				</TooltipContent>
			</Tooltip>

			{models.length === 0 ? (
				<Tooltip>
					<TooltipTrigger asChild>{modelChip}</TooltipTrigger>
					<TooltipContent side="top">
						Open Codex's model picker (/model)
					</TooltipContent>
				</Tooltip>
			) : (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>{modelChip}</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-64">
						{models.map((model) => (
							<DropdownMenuItem
								key={model.id}
								onClick={() => pickModel(model.id)}
								className="flex items-center gap-2"
							>
								<div className="flex flex-1 flex-col gap-0.5">
									<span className="text-sm font-medium">{model.label}</span>
									{model.description && (
										<span className="text-xs text-muted-foreground">
											{model.description}
										</span>
									)}
								</div>
								{model.id === currentModel?.id && (
									<CheckIcon className="size-4 shrink-0" />
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}

			{currentModel === undefined ? (
				<Tooltip>
					<TooltipTrigger asChild>{effortChip}</TooltipTrigger>
					<TooltipContent side="top">
						Reasoning effort — chosen in the /model picker
					</TooltipContent>
				</Tooltip>
			) : (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>{effortChip}</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-64">
						{currentModel.supportedReasoningLevels.map((level) => (
							<DropdownMenuItem
								key={level.effort}
								onClick={() => pickEffort(level.effort)}
								className="flex items-center gap-2"
							>
								<div className="flex flex-1 flex-col gap-0.5">
									<span className="text-sm font-medium">
										{CODEX_EFFORT_LABELS[level.effort] ?? level.effort}
									</span>
									{level.description && (
										<span className="text-xs text-muted-foreground">
											{level.description}
										</span>
									)}
								</div>
								{level.effort === effectiveEffort && (
									<CheckIcon className="size-4 shrink-0" />
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
}
