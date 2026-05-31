import {
	getLocalLobeModelProviderIcon,
	type LocalModelProviderIconVariant,
} from "@superset/ui/icons/model-providers";
import { cn } from "@superset/ui/utils";
import { useMemo } from "react";

type ProviderProtocol = "anthropic" | "openai-chat" | "openai-responses";

interface LobeIconSpec {
	id: string;
	variant: LocalModelProviderIconVariant;
}

interface ModelProviderIconProps {
	provider?: string | null;
	modelId?: string | null;
	protocol?: ProviderProtocol | string | null;
	className?: string;
}

function normalize(value: string): string {
	return value.toLowerCase().replace(/[_\s./]+/g, "-");
}

function containsAny(value: string, needles: string[]): boolean {
	return needles.some((needle) => value.includes(needle));
}

function hasOpenAIReasoningModel(value: string): boolean {
	return /(^|-)o[1345]($|-)/.test(value);
}

export function resolveModelProviderIconId({
	provider,
	modelId,
	protocol,
}: Pick<
	ModelProviderIconProps,
	"provider" | "modelId" | "protocol"
>): LobeIconSpec | null {
	const model = normalize(modelId ?? "");
	const providerName = normalize(provider ?? "");
	const combined = `${model} ${providerName}`;

	if (containsAny(model, ["claude", "sonnet", "opus", "haiku"])) {
		return { id: "claude", variant: "color" };
	}
	if (containsAny(combined, ["anthropic"])) {
		return { id: "anthropic", variant: "mono" };
	}
	if (containsAny(combined, ["codex"])) {
		return { id: "codex", variant: "mono" };
	}
	if (
		containsAny(combined, ["openai", "chatgpt", "gpt"]) ||
		hasOpenAIReasoningModel(model)
	) {
		return { id: "openai", variant: "mono" };
	}
	if (containsAny(combined, ["gemini"])) {
		return { id: "gemini", variant: "color" };
	}
	if (containsAny(combined, ["google", "vertex"])) {
		return { id: "google", variant: "color" };
	}
	if (containsAny(combined, ["deepseek"])) {
		return { id: "deepseek", variant: "color" };
	}
	if (containsAny(combined, ["qwen", "dashscope", "tongyi"])) {
		return { id: "qwen", variant: "color" };
	}
	if (containsAny(combined, ["mistral", "mixtral"])) {
		return { id: "mistral", variant: "color" };
	}
	if (containsAny(combined, ["llama", "meta"])) {
		return { id: "meta", variant: "mono" };
	}
	if (containsAny(combined, ["kimi", "moonshot"])) {
		return { id: "kimi", variant: "color" };
	}
	if (containsAny(combined, ["glm", "zhipu"])) {
		return { id: "zhipu", variant: "color" };
	}
	if (containsAny(combined, ["xai", "grok"])) {
		return { id: "xai", variant: "mono" };
	}
	if (containsAny(combined, ["ollama"])) {
		return { id: "ollama", variant: "mono" };
	}
	if (containsAny(combined, ["openrouter"])) {
		return { id: "openrouter", variant: "mono" };
	}
	if (containsAny(combined, ["perplexity"])) {
		return { id: "perplexity", variant: "mono" };
	}
	if (containsAny(combined, ["cohere"])) {
		return { id: "cohere", variant: "color" };
	}
	if (protocol === "openai-chat" || protocol === "openai-responses") {
		return { id: "openai", variant: "mono" };
	}
	if (protocol === "anthropic") {
		return { id: "anthropic", variant: "mono" };
	}
	return null;
}

function fallbackLabel(
	provider?: string | null,
	modelId?: string | null,
): string {
	const value = (provider || modelId || "model").trim();
	return value.slice(0, 1).toUpperCase();
}

export function ModelProviderIcon({
	provider,
	modelId,
	protocol,
	className,
}: ModelProviderIconProps) {
	const spec = useMemo(
		() => resolveModelProviderIconId({ provider, modelId, protocol }),
		[provider, modelId, protocol],
	);
	const icon = spec ? getLocalLobeModelProviderIcon(spec) : null;

	if (icon) {
		return (
			<img
				alt=""
				aria-hidden="true"
				className={cn(
					"shrink-0 object-contain",
					icon.variant === "mono" && "dark:invert",
					className ?? "size-3",
				)}
				decoding="async"
				draggable={false}
				loading="lazy"
				src={icon.src}
			/>
		);
	}

	return (
		<span
			aria-hidden="true"
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-[9px] text-muted-foreground",
				className ?? "size-3",
			)}
		>
			{fallbackLabel(provider, modelId)}
		</span>
	);
}
