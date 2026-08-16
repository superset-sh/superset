import {
	getAgentContextWindowSupport,
	getAgentModelSupport,
	getAgentModeSupport,
	getAgentSpeedSupport,
	resolveAgentEffortSupport,
} from "@superset/shared/agent-models";
import { useCallback, useMemo } from "react";
import { useAgentContextWindowPreference } from "renderer/hooks/useAgentContextWindowPreference";
import { useAgentEffortPreference } from "renderer/hooks/useAgentEffortPreference";
import { useAgentModelPreference } from "renderer/hooks/useAgentModelPreference";
import { useAgentModePreference } from "renderer/hooks/useAgentModePreference";
import { useAgentSpeedPreference } from "renderer/hooks/useAgentSpeedPreference";
import type { AgentChoiceCapability } from "renderer/hooks/useV2AgentChoices";
import {
	buildCursorLaunchSelection,
	buildCursorModelSupport,
	buildCursorVariantSupports,
	type CursorVariantDimension,
	cursorFamilyVariants,
	resolveCursorVariant,
} from "../../utils/cursorModelVariants";

interface PreferenceKeys {
	model: string;
	effort: string;
	mode: string;
	speed: string;
	contextWindow: string;
}

type DisplayInventory = NonNullable<AgentChoiceCapability["inventory"]>;
const EMPTY_RUNTIME_MODELS: DisplayInventory["models"] = [];

function resolveSelectedOption(
	selected: string | null,
	options: readonly { id: string }[] | undefined,
	defaultId?: string,
): string | null {
	if (selected && options?.some((option) => option.id === selected)) {
		return selected;
	}
	return defaultId ?? null;
}

export function useWorkspaceAgentRuntimeSelection(
	selectedPresetId: string | null,
	displayInventory: DisplayInventory | null,
	keys: PreferenceKeys,
) {
	const runtimeModels = displayInventory?.models ?? EMPTY_RUNTIME_MODELS;
	const hasCursorVariants =
		selectedPresetId === "cursor-agent" &&
		displayInventory?.modelSource === "runtime" &&
		runtimeModels.length > 0 &&
		runtimeModels.every((model) => model.variant);
	const modelSupport = useMemo(() => {
		if (!selectedPresetId) return undefined;
		const support = getAgentModelSupport(selectedPresetId);
		if (!support || runtimeModels.length === 0) return support;
		if (hasCursorVariants) {
			return buildCursorModelSupport(support, runtimeModels);
		}
		const defaultModelId = runtimeModels.some(
			(model) => model.id === support.defaultModelId,
		)
			? support.defaultModelId
			: runtimeModels[0]?.id;
		return {
			...support,
			defaultModelId,
			models: runtimeModels.map(({ id, label, provider }) => ({
				id,
				label,
				provider,
			})),
		};
	}, [hasCursorVariants, runtimeModels, selectedPresetId]);
	const { selectedModel, setSelectedModel } = useAgentModelPreference(
		keys.model,
		modelSupport ? selectedPresetId : null,
		modelSupport,
	);
	const resolvedModel =
		selectedModel ??
		modelSupport?.defaultModelId ??
		modelSupport?.models[0]?.id;
	const cursorVariants = useMemo(
		() =>
			hasCursorVariants
				? cursorFamilyVariants(runtimeModels, resolvedModel)
				: [],
		[hasCursorVariants, resolvedModel, runtimeModels],
	);
	const cursorSupports = useMemo(
		() => buildCursorVariantSupports(cursorVariants),
		[cursorVariants],
	);
	const effortSupport = useMemo(() => {
		if (hasCursorVariants) return cursorSupports.effort;
		if (!selectedPresetId) return undefined;
		const runtimeModel = runtimeModels.find(
			(model) => model.id === resolvedModel,
		);
		if (displayInventory?.modelSource !== "runtime") {
			return resolveAgentEffortSupport(
				selectedPresetId,
				resolvedModel,
				undefined,
			);
		}
		return resolveAgentEffortSupport(
			selectedPresetId,
			resolvedModel,
			runtimeModel?.reasoning,
		);
	}, [
		cursorSupports.effort,
		displayInventory?.modelSource,
		hasCursorVariants,
		resolvedModel,
		runtimeModels,
		selectedPresetId,
	]);
	const modeSupport = hasCursorVariants
		? cursorSupports.mode
		: getAgentModeSupport(selectedPresetId ?? "");
	const speedSupport = hasCursorVariants
		? cursorSupports.speed
		: getAgentSpeedSupport(selectedPresetId ?? "", resolvedModel);
	const contextWindowSupport = hasCursorVariants
		? cursorSupports.contextWindow
		: getAgentContextWindowSupport(selectedPresetId ?? "", resolvedModel);
	const { selectedEffort, setSelectedEffort } = useAgentEffortPreference(
		keys.effort,
		effortSupport ? selectedPresetId : null,
		resolvedModel ?? null,
		effortSupport,
	);
	const { selectedMode, setSelectedMode } = useAgentModePreference(
		keys.mode,
		modeSupport ? selectedPresetId : null,
		modeSupport,
		hasCursorVariants ? resolvedModel : null,
	);
	const { selectedSpeed, setSelectedSpeed } = useAgentSpeedPreference(
		keys.speed,
		speedSupport ? selectedPresetId : null,
		resolvedModel ?? null,
		speedSupport,
	);
	const { selectedContextWindow, setSelectedContextWindow } =
		useAgentContextWindowPreference(
			keys.contextWindow,
			contextWindowSupport ? selectedPresetId : null,
			resolvedModel ?? null,
			contextWindowSupport,
		);
	const resolvedEffort = resolveSelectedOption(
		selectedEffort,
		effortSupport?.efforts,
		hasCursorVariants ? effortSupport?.defaultEffortId : undefined,
	);
	const resolvedMode = resolveSelectedOption(
		selectedMode,
		modeSupport?.modes,
		hasCursorVariants ? modeSupport?.defaultModeId : undefined,
	);
	const resolvedSpeed = resolveSelectedOption(
		selectedSpeed,
		speedSupport?.speeds,
		speedSupport?.defaultSpeedId,
	);
	const resolvedContextWindow = resolveSelectedOption(
		selectedContextWindow,
		contextWindowSupport?.contextWindows,
		contextWindowSupport?.defaultContextWindowId,
	);
	const cursorLaunchSelection = hasCursorVariants
		? buildCursorLaunchSelection(cursorVariants, {
				effort: resolvedEffort,
				mode: resolvedMode,
				speed: resolvedSpeed,
				contextWindow: resolvedContextWindow,
			})
		: undefined;

	const applyCursorDimension = useCallback(
		(dimension: CursorVariantDimension, value: string | null) => {
			const variant = resolveCursorVariant(
				cursorVariants,
				{
					effort: dimension === "effort" ? value : resolvedEffort,
					mode: dimension === "mode" ? value : resolvedMode,
					speed: dimension === "speed" ? value : resolvedSpeed,
					contextWindow:
						dimension === "contextWindow" ? value : resolvedContextWindow,
				},
				dimension,
			)?.variant;
			if (!variant) return;
			setSelectedEffort(variant.effort);
			setSelectedMode(variant.mode);
			setSelectedSpeed(variant.speed);
			setSelectedContextWindow(variant.contextWindow);
		},
		[
			cursorVariants,
			resolvedContextWindow,
			resolvedEffort,
			resolvedMode,
			resolvedSpeed,
			setSelectedContextWindow,
			setSelectedEffort,
			setSelectedMode,
			setSelectedSpeed,
		],
	);

	return {
		modelSupport,
		resolvedModel,
		launchModel: cursorLaunchSelection?.launchModel ?? resolvedModel ?? null,
		setSelectedModel,
		effortSupport,
		modeSupport,
		speedSupport,
		contextWindowSupport,
		resolvedEffort:
			cursorLaunchSelection?.resolvedTraits.effort ?? resolvedEffort,
		resolvedMode: cursorLaunchSelection?.resolvedTraits.mode ?? resolvedMode,
		resolvedSpeed: cursorLaunchSelection?.resolvedTraits.speed ?? resolvedSpeed,
		resolvedContextWindow:
			cursorLaunchSelection?.resolvedTraits.contextWindow ??
			resolvedContextWindow,
		onEffortChange: hasCursorVariants
			? (value: string | null) => applyCursorDimension("effort", value)
			: (value: string | null) =>
					setSelectedEffort(
						value === effortSupport?.defaultEffortId ? null : value,
					),
		onModeChange: hasCursorVariants
			? (value: string | null) => applyCursorDimension("mode", value)
			: setSelectedMode,
		onSpeedChange: hasCursorVariants
			? (value: string | null) => applyCursorDimension("speed", value)
			: setSelectedSpeed,
		onContextWindowChange: hasCursorVariants
			? (value: string | null) => applyCursorDimension("contextWindow", value)
			: setSelectedContextWindow,
		traitsForLaunch: cursorLaunchSelection
			? cursorLaunchSelection.traitsForLaunch
			: {
					effort: effortSupport ? resolvedEffort : null,
					mode: modeSupport ? resolvedMode : null,
					speed: speedSupport ? resolvedSpeed : null,
					contextWindow: contextWindowSupport ? resolvedContextWindow : null,
				},
	};
}
