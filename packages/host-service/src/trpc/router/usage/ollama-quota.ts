/** Ollama Cloud quota from the usage endpoint, using a user-provided API key. */
import type { UsageAccount, UsageQuotaWindow } from "./types";

const ENDPOINT = "https://ollama.com/api/usage";
const FETCH_TIMEOUT_MS = 10_000;

interface OllamaUsageLimits {
	monthly?: { usage?: unknown };
}

function fractionToPercent(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	return Math.max(0, Math.min(100, Math.round(value * 100)));
}

export function parseOllamaUsage(
	payload: unknown,
): { windows: UsageQuotaWindow[] } | null {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return null;
	}
	const limits = (payload as { limits?: unknown }).limits;
	if (!limits || typeof limits !== "object" || Array.isArray(limits)) {
		return null;
	}
	const { monthly } = limits as OllamaUsageLimits;
	const monthlyPercent = fractionToPercent(monthly?.usage);
	if (monthlyPercent === null) return null;
	return {
		windows: [
			{
				id: "monthly",
				label: "Monthly",
				usedPercent: monthlyPercent,
				resetsAt: null,
			},
		],
	};
}

export async function fetchOllamaAccounts(
	apiKey: string | null,
): Promise<UsageAccount[]> {
	if (!apiKey) return [];
	const base = {
		agent: "ollama" as const,
		credentialKind: "api_key" as const,
		accountKey: "ollama-cloud-api-key",
		sourceLabel: "Ollama Cloud API key",
		email: null,
		plan: null,
		creditsBalance: null,
		extraUsage: null,
		selection: null,
		isDefault: false,
		fetchedAt: new Date(),
	};
	try {
		const response = await fetch(ENDPOINT, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				Accept: "application/json",
			},
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (response.status === 401 || response.status === 403) {
			return [
				{
					...base,
					status: "token_expired",
					statusDetail:
						"Ollama Cloud API key rejected — replace it in Settings.",
					windows: [],
				},
			];
		}
		if (!response.ok)
			throw new Error(`Usage endpoint returned ${response.status}.`);
		const parsed = parseOllamaUsage(await response.json());
		if (!parsed) throw new Error("No usable quota data returned.");
		return [
			{
				...base,
				status: "ok",
				statusDetail: null,
				windows: parsed.windows,
			},
		];
	} catch (error) {
		return [
			{
				...base,
				status: "unavailable",
				statusDetail:
					error instanceof Error ? error.message : "Failed to fetch usage.",
				windows: [],
			},
		];
	}
}
