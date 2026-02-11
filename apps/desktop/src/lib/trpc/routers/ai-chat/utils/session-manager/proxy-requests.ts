import { loadToken } from "../../../auth/utils/auth-functions";

const DEFAULT_RETRY_BASE_DELAY_MS = 150;

export async function buildProxyHeaders(): Promise<Record<string, string>> {
	const { token } = await loadToken();
	if (!token) {
		throw new Error("User not authenticated");
	}
	return {
		"Content-Type": "application/json",
		Authorization: `Bearer ${token}`,
	};
}

async function sleep({ ms }: { ms: number }): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postJsonWithRetry({
	url,
	headers,
	body,
	maxAttempts,
	operation,
	signal,
	retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
}: {
	url: string;
	headers: Record<string, string>;
	body: unknown;
	maxAttempts: number;
	operation: string;
	signal?: AbortSignal;
	retryBaseDelayMs?: number;
}): Promise<void> {
	let lastError: Error | null = null;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const res = await fetch(url, {
				method: "POST",
				headers,
				signal,
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const rawDetail = await res.text().catch(() => "");
				const detail = rawDetail.trim();
				throw new Error(
					`${operation} failed: status ${res.status}${detail ? ` (${detail.slice(0, 300)})` : ""}`,
				);
			}
			return;
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") {
				throw error;
			}

			lastError = error instanceof Error ? error : new Error(String(error));
			if (attempt === maxAttempts) {
				break;
			}
			await sleep({ ms: retryBaseDelayMs * 2 ** (attempt - 1) });
		}
	}

	throw (
		lastError ?? new Error(`${operation} failed after ${maxAttempts} attempts`)
	);
}
