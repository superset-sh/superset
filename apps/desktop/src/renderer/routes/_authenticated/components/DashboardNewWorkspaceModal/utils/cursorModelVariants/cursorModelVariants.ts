import type {
	AgentContextWindowSupport,
	AgentEffortSupport,
	AgentModelOption,
	AgentModelSupport,
	AgentModeSupport,
	AgentRuntimeModelVariant,
	AgentSpeedSupport,
} from "@superset/shared/agent-models";

export interface CursorRuntimeModel extends AgentModelOption {
	variant?: AgentRuntimeModelVariant;
}

export interface CursorVariantSelection {
	effort?: string | null;
	speed?: string | null;
	mode?: string | null;
	contextWindow?: string | null;
}

export type CursorVariantDimension = keyof CursorVariantSelection;

export interface CursorLaunchSelection {
	launchModel: string | null;
	resolvedTraits: Required<CursorVariantSelection>;
	traitsForLaunch: Required<CursorVariantSelection>;
}

const CURSOR_VARIANT_DIMENSIONS: readonly CursorVariantDimension[] = [
	"effort",
	"speed",
	"mode",
	"contextWindow",
];

const EFFORT_ORDER = [
	"default",
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;

const EFFORT_LABELS: Readonly<Record<string, string>> = {
	default: "Default",
	none: "None",
	minimal: "Minimal",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "Extra High",
	max: "Max",
};

function uniqueValues(
	models: readonly CursorRuntimeModel[],
	read: (variant: AgentRuntimeModelVariant) => string,
): string[] {
	return [
		...new Set(
			models.flatMap((model) => (model.variant ? [read(model.variant)] : [])),
		),
	];
}

export function buildCursorModelSupport(
	transport: AgentModelSupport,
	models: readonly CursorRuntimeModel[],
): AgentModelSupport {
	const seen = new Set<string>();
	const families = models.flatMap((model): AgentModelOption[] => {
		const variant = model.variant;
		if (!variant || seen.has(variant.familyId)) return [];
		seen.add(variant.familyId);
		return [
			{
				id: variant.familyId,
				label: variant.familyLabel,
				provider: model.provider,
			},
		];
	});
	return {
		...transport,
		defaultModelId:
			families.find((model) => model.id === "auto")?.id ?? families[0]?.id,
		models: families,
		modelAliases: Object.fromEntries(
			models.flatMap((model) =>
				model.variant ? [[model.id, model.variant.familyId]] : [],
			),
		),
	};
}

export function cursorFamilyVariants(
	models: readonly CursorRuntimeModel[],
	familyId: string | null | undefined,
): CursorRuntimeModel[] {
	if (!familyId) return [];
	return models.filter((model) => model.variant?.familyId === familyId);
}

export function buildCursorVariantSupports(
	models: readonly CursorRuntimeModel[],
): {
	effort?: AgentEffortSupport;
	speed?: AgentSpeedSupport;
	mode?: AgentModeSupport;
	contextWindow?: AgentContextWindowSupport;
} {
	const first = models[0]?.variant;
	if (!first) return {};
	const defaultEffort = models.some(
		(model) => model.variant?.effort === "default",
	)
		? "default"
		: first.effort;
	const defaultVariant =
		resolveCursorVariant(models, {
			effort: defaultEffort,
			speed: "standard",
			mode: "standard",
			contextWindow: "default",
		})?.variant ?? first;
	const efforts = uniqueValues(models, (variant) => variant.effort).sort(
		(a, b) =>
			EFFORT_ORDER.indexOf(a as (typeof EFFORT_ORDER)[number]) -
			EFFORT_ORDER.indexOf(b as (typeof EFFORT_ORDER)[number]),
	);
	const speeds = uniqueValues(models, (variant) => variant.speed);
	const modes = uniqueValues(models, (variant) => variant.mode);
	const contexts = uniqueValues(models, (variant) => variant.contextWindow);

	return {
		effort:
			efforts.length > 1
				? {
						presetId: "cursor-agent",
						effortFlag: "--model",
						defaultEffortId: defaultVariant.effort,
						efforts: efforts.map((id) => ({
							id,
							label: EFFORT_LABELS[id] ?? id,
						})),
					}
				: undefined,
		speed:
			speeds.length > 1
				? {
						presetId: "cursor-agent",
						label: "Fast Mode",
						defaultSpeedId: defaultVariant.speed,
						speeds: [
							{ id: "standard", label: "Off", args: [] },
							{ id: "fast", label: "Fast", args: [] },
						].filter((option) => speeds.includes(option.id)),
					}
				: undefined,
		mode:
			modes.length > 1
				? {
						presetId: "cursor-agent",
						label: "Thinking",
						defaultModeId: defaultVariant.mode,
						modes: [
							{ id: "standard", label: "Off", args: [] },
							{ id: "thinking", label: "Thinking", args: [] },
						].filter((option) => modes.includes(option.id)),
					}
				: undefined,
		contextWindow:
			contexts.length > 1
				? {
						presetId: "cursor-agent",
						defaultContextWindowId: defaultVariant.contextWindow,
						contextWindows: [
							{ id: "default", label: "Default" },
							{ id: "1m", label: "1M" },
						].filter((option) => contexts.includes(option.id)),
					}
				: undefined,
	};
}

export function resolveCursorVariant(
	models: readonly CursorRuntimeModel[],
	selection: CursorVariantSelection,
	preferredDimension?: CursorVariantDimension,
): CursorRuntimeModel | undefined {
	const candidates = models.filter((model) => model.variant);
	if (candidates.length === 0) return undefined;
	return candidates.reduce((best, candidate) => {
		const score = scoreCursorVariant(candidate, selection, preferredDimension);
		const bestScore = scoreCursorVariant(best, selection, preferredDimension);
		return score > bestScore ? candidate : best;
	}, candidates[0]);
}

export function buildCursorLaunchSelection(
	models: readonly CursorRuntimeModel[],
	selection: CursorVariantSelection,
): CursorLaunchSelection {
	const resolved = resolveCursorVariant(models, selection);
	return {
		launchModel: resolved?.id ?? null,
		resolvedTraits: {
			effort: resolved?.variant?.effort ?? selection.effort ?? null,
			speed: resolved?.variant?.speed ?? selection.speed ?? null,
			mode: resolved?.variant?.mode ?? selection.mode ?? null,
			contextWindow:
				resolved?.variant?.contextWindow ?? selection.contextWindow ?? null,
		},
		traitsForLaunch: {
			effort: null,
			speed: null,
			mode: null,
			contextWindow: null,
		},
	};
}

function scoreCursorVariant(
	model: CursorRuntimeModel,
	selection: CursorVariantSelection,
	preferredDimension?: CursorVariantDimension,
): number {
	return CURSOR_VARIANT_DIMENSIONS.reduce((total, dimension) => {
		const requested = selection[dimension];
		if (requested == null || model.variant?.[dimension] !== requested) {
			return total;
		}
		return total + (dimension === preferredDimension ? 100 : 10);
	}, 0);
}
