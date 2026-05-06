import {
	type AuthStatusLike,
	deriveModelProviderStatus,
	type ModelProviderStatus,
	type ProviderId,
} from "shared/ai/provider-status";

export interface AnthropicFormValues {
	apiKey: string;
	authToken: string;
	baseUrl: string;
	extraEnv: string;
}

export const EMPTY_ANTHROPIC_FORM: AnthropicFormValues = {
	apiKey: "",
	authToken: "",
	baseUrl: "",
	extraEnv: "",
};

export function parseAnthropicForm(envText: string): AnthropicFormValues {
	const lines = envText
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	const remaining: string[] = [];
	const values = { ...EMPTY_ANTHROPIC_FORM };

	for (const line of lines) {
		const normalized = line.replace(/^export\s+/, "");
		const eqIndex = normalized.indexOf("=");
		if (eqIndex === -1) {
			remaining.push(line);
			continue;
		}

		const key = normalized.slice(0, eqIndex).trim();
		const value = normalized.slice(eqIndex + 1).trim();
		switch (key) {
			case "ANTHROPIC_API_KEY":
				values.apiKey = value;
				break;
			case "ANTHROPIC_AUTH_TOKEN":
				values.authToken = value;
				break;
			case "ANTHROPIC_BASE_URL":
				values.baseUrl = value;
				break;
			default:
				remaining.push(line);
		}
	}

	values.extraEnv = remaining.join("\n");
	return values;
}

export function buildAnthropicEnvText(values: AnthropicFormValues): string {
	const lines = [
		values.apiKey.trim() ? `ANTHROPIC_API_KEY=${values.apiKey.trim()}` : null,
		values.authToken.trim()
			? `ANTHROPIC_AUTH_TOKEN=${values.authToken.trim()}`
			: null,
		values.baseUrl.trim()
			? `ANTHROPIC_BASE_URL=${values.baseUrl.trim()}`
			: null,
		values.extraEnv.trim() ? values.extraEnv.trim() : null,
	].filter((line): line is string => Boolean(line));

	return lines.join("\n");
}

const EXTERNAL_OAUTH_LABELS: Record<ProviderId, string> = {
	anthropic: "Connected via Claude",
	openai: "Connected via ChatGPT",
};

export function getProviderSubtitle(
	providerId: ProviderId,
	status: ModelProviderStatus | undefined,
): string {
	if (status?.issue) {
		return status.issue.message;
	}
	if (!status || status.connectionState === "disconnected") {
		return "";
	}
	if (status.source === "external" && status.authMethod === "oauth") {
		return EXTERNAL_OAUTH_LABELS[providerId];
	}
	if (status.authMethod === "oauth") {
		return "Connected in Superset";
	}
	if (status.authMethod === "api_key" || status.authMethod === "env") {
		return "Connected with API key";
	}
	return "Connected";
}

export function getStatusBadge(
	status: ModelProviderStatus | undefined,
): { label: string; variant: "secondary" | "outline" | "destructive" } | null {
	if (!status || status.connectionState === "disconnected") {
		return { label: "Not connected", variant: "outline" };
	}
	if (status.issue?.code === "expired") {
		return { label: "Expired", variant: "destructive" };
	}
	if (status.issue) {
		return { label: "Needs attention", variant: "outline" };
	}
	if (status.connectionState === "connected") {
		return { label: "Active", variant: "secondary" };
	}
	return null;
}

export function resolveProviderStatus(params: {
	providerId: ProviderId;
	authStatus?: AuthStatusLike;
}): ModelProviderStatus | undefined {
	const { providerId, authStatus } = params;
	if (!authStatus) return undefined;
	return deriveModelProviderStatus({ providerId, authStatus });
}

export type ProviderAction =
	| { kind: "connect" }
	| { kind: "reconnect" }
	| { kind: "logout" }
	| null;

/**
 * Single source of truth for the provider action button.
 */
export function getProviderAction(
	status: ModelProviderStatus | undefined,
): ProviderAction {
	if (!status || status.connectionState === "disconnected") {
		return { kind: "connect" };
	}
	if (status.issue?.remediation === "reconnect") {
		return { kind: "reconnect" };
	}
	if (status.connectionState === "connected") {
		return { kind: "logout" };
	}
	return { kind: "connect" };
}
