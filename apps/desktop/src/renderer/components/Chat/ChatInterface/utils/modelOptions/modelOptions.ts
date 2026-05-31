import type { ModelOption } from "../../types";

export type ModelCatalogOption = ModelOption & {
	modelId?: string;
	providerId?: string;
	protocol?: string;
};

export type ModelGroup = [label: string, models: ModelOption[]];

export type ModelFamily =
	| "OpenAI"
	| "Anthropic"
	| "GLM"
	| "Google"
	| "Qwen"
	| "DeepSeek"
	| "Kimi"
	| "Meta"
	| "Mistral"
	| "xAI"
	| "Other";

const TYPO_SEARCH_REPLACEMENTS: Array<[RegExp, string]> = [[/^got/, "gpt"]];

const MODEL_FAMILY_ORDER: ModelFamily[] = [
	"OpenAI",
	"Anthropic",
	"GLM",
	"Google",
	"Qwen",
	"DeepSeek",
	"Kimi",
	"Meta",
	"Mistral",
	"xAI",
	"Other",
];

const MODEL_FAMILY_SEARCH_KEYWORDS: Record<ModelFamily, string[]> = {
	OpenAI: ["openai", "gpt", "chatgpt", "codex", "o1", "o3", "o4", "o5"],
	Anthropic: ["anthropic", "claude", "sonnet", "opus", "haiku"],
	GLM: ["glm", "zhipu", "zhipuai"],
	Google: ["google", "gemini", "vertex"],
	Qwen: ["qwen", "dashscope", "tongyi", "alibaba"],
	DeepSeek: ["deepseek"],
	Kimi: ["kimi", "moonshot"],
	Meta: ["meta", "llama"],
	Mistral: ["mistral", "mixtral"],
	xAI: ["xai", "grok"],
	Other: ["other", "custom"],
};

function unique(values: string[]): string[] {
	return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function normalizeModelSearchText(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function searchVariants(value: string): string[] {
	const normalized = normalizeModelSearchText(value);
	return unique([
		normalized,
		...TYPO_SEARCH_REPLACEMENTS.map(([pattern, replacement]) =>
			normalized.replace(pattern, replacement),
		),
	]);
}

function isNumericOnlySearch(value: string): boolean {
	const trimmed = value.trim();
	return /\d/.test(trimmed) && !/[a-z]/i.test(trimmed);
}

function modelWithProviderFields(model: ModelOption): ModelCatalogOption {
	return model as ModelCatalogOption;
}

function hasOpenAIReasoningModel(value: string): boolean {
	return /(^|[^a-z0-9])o[1345]($|[^a-z0-9])/.test(value);
}

function includesAny(value: string, needles: string[]): boolean {
	return needles.some((needle) => value.includes(needle));
}

export function inferModelFamily(model: ModelOption): ModelFamily {
	const modelFields = modelWithProviderFields(model);
	const modelSource = [model.name, modelFields.modelId ?? model.id]
		.join(" ")
		.toLowerCase();
	const providerSource = [model.provider, modelFields.providerId ?? ""]
		.join(" ")
		.toLowerCase();

	if (includesAny(modelSource, ["codex", "gpt", "chatgpt"])) return "OpenAI";
	if (hasOpenAIReasoningModel(modelSource)) return "OpenAI";
	if (
		includesAny(modelSource, ["claude", "sonnet", "opus", "haiku", "anthropic"])
	) {
		return "Anthropic";
	}
	if (includesAny(modelSource, ["glm", "zhipu"])) return "GLM";
	if (includesAny(modelSource, ["gemini", "google", "vertex"])) return "Google";
	if (includesAny(modelSource, ["qwen", "dashscope", "tongyi", "alibaba"])) {
		return "Qwen";
	}
	if (includesAny(modelSource, ["deepseek"])) return "DeepSeek";
	if (includesAny(modelSource, ["kimi", "moonshot"])) return "Kimi";
	if (includesAny(modelSource, ["llama", "meta"])) return "Meta";
	if (includesAny(modelSource, ["mistral", "mixtral"])) return "Mistral";
	if (includesAny(modelSource, ["xai", "grok"])) return "xAI";

	if (includesAny(providerSource, ["codex", "openai", "chatgpt"])) {
		return "OpenAI";
	}
	if (includesAny(providerSource, ["anthropic", "claude"])) {
		return "Anthropic";
	}
	if (includesAny(providerSource, ["glm", "zhipu"])) return "GLM";
	if (includesAny(providerSource, ["gemini", "google", "vertex"])) {
		return "Google";
	}
	if (includesAny(providerSource, ["qwen", "dashscope", "tongyi", "alibaba"])) {
		return "Qwen";
	}
	if (includesAny(providerSource, ["deepseek"])) return "DeepSeek";
	if (includesAny(providerSource, ["kimi", "moonshot"])) return "Kimi";
	if (includesAny(providerSource, ["llama", "meta"])) return "Meta";
	if (includesAny(providerSource, ["mistral", "mixtral"])) return "Mistral";
	if (includesAny(providerSource, ["xai", "grok"])) return "xAI";

	if (
		modelFields.protocol === "openai-chat" ||
		modelFields.protocol === "openai-responses"
	) {
		return "OpenAI";
	}
	if (modelFields.protocol === "anthropic") return "Anthropic";

	return "Other";
}

export function getModelSearchKeywords(model: ModelOption): string[] {
	const modelWithFields = modelWithProviderFields(model);
	const family = inferModelFamily(model);
	const rawKeywords = unique([
		model.name,
		model.provider,
		modelWithFields.modelId ?? "",
		modelWithFields.protocol ?? "",
		family,
		...MODEL_FAMILY_SEARCH_KEYWORDS[family],
		`${model.provider} ${model.name}`,
		`${model.provider}/${model.name}`,
	]);

	return unique([...rawKeywords, ...rawKeywords.map(normalizeModelSearchText)]);
}

function getVisibleModelSearchKeywords(model: ModelOption): string[] {
	const modelWithFields = modelWithProviderFields(model);
	const rawKeywords = unique([model.name, modelWithFields.modelId ?? ""]);
	return unique([...rawKeywords, ...rawKeywords.map(normalizeModelSearchText)]);
}

export function filterModelSelectorItem(
	value: string,
	search: string,
	keywords?: string[],
): number {
	const searchValues = searchVariants(search);
	if (searchValues.length === 0 || searchValues[0] === "") return 1;

	const candidates = unique([value, ...(keywords ?? [])]).map(
		normalizeModelSearchText,
	);

	for (const searchValue of searchValues) {
		if (!searchValue) return 1;
		if (candidates.some((candidate) => candidate === searchValue)) return 1;
		if (candidates.some((candidate) => candidate.includes(searchValue))) {
			return 0.8;
		}
	}

	return 0;
}

function filterModelOptionBySearch(model: ModelOption, query: string): number {
	if (isNumericOnlySearch(query)) {
		return filterModelSelectorItem(
			model.name,
			query,
			getVisibleModelSearchKeywords(model),
		);
	}

	return filterModelSelectorItem(
		modelWithProviderFields(model).modelId ?? model.name,
		query,
		getModelSearchKeywords(model),
	);
}

export function findModelByQuery(
	models: ModelOption[],
	query: string,
): ModelOption | null {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) return null;

	const exactById = models.find(
		(model) => model.id.toLowerCase() === normalizedQuery,
	);
	if (exactById) return exactById;

	const exactByName = models.find(
		(model) => model.name.toLowerCase() === normalizedQuery,
	);
	if (exactByName) return exactByName;

	return (
		models.find(
			(model) => filterModelOptionBySearch(model, normalizedQuery) > 0,
		) ?? null
	);
}

function extractVersionVectors(value: string): number[][] {
	const vectors: number[][] = [];
	for (const match of value.matchAll(/\d+(?:[._-]\d+)*/g)) {
		const start = match.index ?? 0;
		const end = start + match[0].length;
		const previous = value[start - 1]?.toLowerCase();
		const next = value[end]?.toLowerCase();
		const previousPrevious = value[start - 2]?.toLowerCase();
		const isPreviousWordCharacter = previous ? /[a-z]/.test(previous) : false;
		const isNextWordCharacter = next ? /[a-z]/.test(next) : false;
		const isVersionPrefix =
			previous === "v" &&
			(!previousPrevious || !/[a-z]/.test(previousPrevious));
		if ((isPreviousWordCharacter && !isVersionPrefix) || isNextWordCharacter) {
			continue;
		}
		const vector = match[0].split(/[._-]/).map((part) => Number(part));
		if (
			vector.length === 0 ||
			vector.some((part) => !Number.isFinite(part) || part >= 1000)
		) {
			continue;
		}
		vectors.push(vector);
	}
	return vectors;
}

function compareVersionVectorsDesc(a: number[], b: number[]): number {
	const maxLength = Math.max(a.length, b.length);
	for (let index = 0; index < maxLength; index += 1) {
		const aPart = a[index] ?? -1;
		const bPart = b[index] ?? -1;
		if (aPart !== bPart) return bPart - aPart;
	}
	return 0;
}

function bestVersionVector(model: ModelOption): number[] {
	const modelWithFields = modelWithProviderFields(model);
	const source = `${model.name} ${model.id} ${modelWithFields.modelId ?? ""}`;
	const vectors = extractVersionVectors(source);
	if (vectors.length === 0) return [];
	return vectors.sort(compareVersionVectorsDesc)[0] ?? [];
}

function modelEffortRank(model: ModelOption): number {
	const source = `${model.name} ${model.id}`.toLowerCase();
	if (source.includes("xhigh")) return 5;
	if (source.includes("high")) return 4;
	if (source.includes("medium")) return 3;
	if (source.includes("low")) return 2;
	return 0;
}

export function compareModelOptions(a: ModelOption, b: ModelOption): number {
	const versionComparison = compareVersionVectorsDesc(
		bestVersionVector(a),
		bestVersionVector(b),
	);
	if (versionComparison !== 0) return versionComparison;

	const effortComparison = modelEffortRank(b) - modelEffortRank(a);
	if (effortComparison !== 0) return effortComparison;

	const lengthComparison = a.name.length - b.name.length;
	if (lengthComparison !== 0) return lengthComparison;

	return b.name.localeCompare(a.name, undefined, {
		numeric: true,
		sensitivity: "base",
	});
}

export function groupModelsByModelFamily(models: ModelOption[]): ModelGroup[] {
	const groups = new Map<ModelFamily, ModelOption[]>();

	for (const model of models) {
		const family = inferModelFamily(model);
		const existingGroup = groups.get(family);
		if (existingGroup) {
			existingGroup.push(model);
			continue;
		}
		groups.set(family, [model]);
	}

	return MODEL_FAMILY_ORDER.map((family) => {
		const familyModels = groups.get(family) ?? [];
		return [family, [...familyModels].sort(compareModelOptions)] as ModelGroup;
	}).filter(([, familyModels]) => familyModels.length > 0);
}

export function filterModelGroupsBySearch(
	groups: ModelGroup[],
	search: string,
): ModelGroup[] {
	const query = search.trim();
	if (query.length === 0) return groups;

	return groups
		.map(([label, models]) => {
			const matchingModels = models
				.map((model, index) => ({
					index,
					model,
					score: filterModelOptionBySearch(model, query),
				}))
				.filter(({ score }) => score > 0)
				.sort(
					(a, b) =>
						b.score - a.score ||
						compareModelOptions(a.model, b.model) ||
						a.index - b.index,
				)
				.map(({ model }) => model);

			return [label, matchingModels] as ModelGroup;
		})
		.filter(([, models]) => models.length > 0);
}
