import type { AgentCredentialKind } from "@superset/db/schema";

const TIMEOUT_MS = 10_000;
const ANTHROPIC_DEFAULT = "https://api.anthropic.com";
const OPENAI_DEFAULT = "https://api.openai.com";
const GATEWAY_DEFAULT = "https://ai-gateway.vercel.sh";

export interface ValidationResult {
	ok: boolean;
	/** Shown to the person who pressed Save. Terse, no provider body echoed. */
	message?: string;
	i18nKey?: string;
	params?: Record<string, string | number>;
}

/**
 * Joins a base URL to a probe path. A base URL is usually given with its
 * version segment already on it, so that segment is trimmed before the path
 * is appended; without this the request lands on `/v1/v1/...` and 404s.
 */
function endpoint(
	baseUrl: string | null | undefined,
	fallback: string,
	path: string,
): string {
	const origin = (baseUrl || fallback)
		.replace(/\/+$/, "")
		.replace(/\/v\d+$/, "");
	return `${origin}${path}`;
}

async function probe(
	url: string,
	headers: Record<string, string>,
	rejected: { message: string; i18nKey: string },
): Promise<ValidationResult> {
	let response: Response;
	try {
		response = await fetch(url, {
			headers,
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch {
		return {
			ok: false,
			message: "Could not reach the provider. Try again.",
			i18nKey: "serverError.agentCredential.providerUnreachable",
		};
	}
	if (response.status === 401 || response.status === 403) {
		return { ok: false, ...rejected };
	}
	if (!response.ok) {
		return {
			ok: false,
			message: `The provider answered ${response.status}.`,
			i18nKey: "serverError.agentCredential.providerAnswered",
			params: { status: response.status },
		};
	}
	return { ok: true };
}

/**
 * Checks a credential against the provider before it is stored, so a typo is
 * caught while the person is still looking at the field.
 */
export async function validateAgentCredential(input: {
	agent: string;
	kind: AgentCredentialKind;
	value: string;
	baseUrl?: string | null;
	provider?: string | null;
}): Promise<ValidationResult> {
	const { agent, kind, value, baseUrl, provider } = input;
	// The gateway's model list is public, so it can never tell a good key from
	// a bad one; credits is the cheapest call there that actually authenticates.
	if (provider === "gateway") {
		return probe(
			endpoint(baseUrl, GATEWAY_DEFAULT, "/v1/credits"),
			{ Authorization: `Bearer ${value}` },
			{
				message: "Vercel AI Gateway rejected this key.",
				i18nKey: "serverError.agentCredential.gatewayRejectedKey",
			},
		);
	}
	if (agent === "claude") {
		if (kind === "subscription") {
			return probe(
				endpoint(baseUrl, ANTHROPIC_DEFAULT, "/v1/models"),
				{
					Authorization: `Bearer ${value}`,
					"anthropic-version": "2023-06-01",
					"anthropic-beta": "oauth-2025-04-20",
				},
				{
					message: "Anthropic rejected this token.",
					i18nKey: "serverError.agentCredential.anthropicRejectedToken",
				},
			);
		}
		return probe(
			endpoint(baseUrl, ANTHROPIC_DEFAULT, "/v1/models"),
			{ "x-api-key": value, "anthropic-version": "2023-06-01" },
			{
				message: "Anthropic rejected this API key.",
				i18nKey: "serverError.agentCredential.anthropicRejectedKey",
			},
		);
	}
	if (agent === "codex") {
		if (kind === "subscription") {
			// A ChatGPT sign-in is not a bearer token we can check; it is stored
			// as-is and the agent reports the failure itself.
			return { ok: true };
		}
		return probe(
			endpoint(baseUrl, OPENAI_DEFAULT, "/v1/models"),
			{ Authorization: `Bearer ${value}` },
			{
				message: "OpenAI rejected this API key.",
				i18nKey: "serverError.agentCredential.openaiRejectedKey",
			},
		);
	}
	return { ok: true };
}
