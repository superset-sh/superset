import { runWithAnthropicOAuthRetry } from "./run-agent-oauth";

export type AuthRetryOperation<T> = () => Promise<T>;

export type ProviderAuthRetryHandler = <T>(
	operation: AuthRetryOperation<T>,
) => Promise<T>;

export interface RunWithProviderAuthRetryOptions {
	modelId?: string;
	handlers?: Partial<Record<string, ProviderAuthRetryHandler>>;
}

const defaultProviderAuthRetryHandlers: Record<
	string,
	ProviderAuthRetryHandler
> = {
	anthropic: runWithAnthropicOAuthRetry,
};

export function resolveModelProvider(modelId?: string): string | null {
	if (!modelId) {
		return null;
	}

	const normalizedModelId = modelId.trim().toLowerCase();
	if (!normalizedModelId) {
		return null;
	}

	const slashIndex = normalizedModelId.indexOf("/");
	if (slashIndex > -1) {
		return normalizedModelId.slice(0, slashIndex);
	}

	// Keep existing behavior: slash-less model IDs default to anthropic.
	return "anthropic";
}

export async function runWithProviderAuthRetry<T>(
	operation: AuthRetryOperation<T>,
	options: RunWithProviderAuthRetryOptions,
): Promise<T> {
	const provider = resolveModelProvider(options.modelId);
	if (!provider) {
		return operation();
	}

	const handler =
		options.handlers?.[provider] ?? defaultProviderAuthRetryHandlers[provider];
	if (!handler) {
		return operation();
	}

	return handler(operation);
}
