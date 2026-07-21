import type {
	ProviderId,
	ProviderSnapshot,
	ProviderStatus,
} from "../usage-snapshot";

const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_BACKOFF_MS = 60_000;

export class RateLimitError extends Error {
	constructor(readonly retryAfterMs: number) {
		super("Rate limited");
		this.name = "RateLimitError";
	}
}

export function emptySnapshot(
	providerId: ProviderId,
	status: ProviderStatus,
	overrides: Partial<ProviderSnapshot> = {},
): ProviderSnapshot {
	return {
		providerId,
		status,
		updatedAt: new Date(),
		email: null,
		planLabel: null,
		windows: [],
		credits: null,
		cost: null,
		errorMessage: null,
		...overrides,
	};
}

export abstract class ProviderCollector {
	abstract readonly providerId: ProviderId;

	private lastGood: ProviderSnapshot | null = null;
	private backoffUntil = 0;

	/** Subclasses read credentials + probe the provider and build a snapshot. */
	protected abstract fetchSnapshot(): Promise<ProviderSnapshot>;

	async collect(): Promise<ProviderSnapshot> {
		if (Date.now() < this.backoffUntil && this.lastGood) {
			return this.lastGood;
		}

		try {
			const snapshot = await this.fetchSnapshot();
			// Only cache readings that actually reached the provider; keep the last
			// good value behind transient no-credentials/auth blips.
			if (snapshot.status === "ok") {
				this.lastGood = snapshot;
			}
			return snapshot;
		} catch (error) {
			if (error instanceof RateLimitError) {
				this.backoffUntil = Date.now() + error.retryAfterMs;
			}
			if (this.lastGood) {
				return this.lastGood;
			}
			return emptySnapshot(this.providerId, "auth-error", {
				errorMessage:
					error instanceof Error ? error.message : "Failed to load usage",
			});
		}
	}

	protected async fetchWithTimeout(
		url: string,
		init: RequestInit = {},
	): Promise<Response> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		try {
			const response = await fetch(url, {
				...init,
				signal: controller.signal,
			});
			if (response.status === 429) {
				const retryAfter = response.headers.get("retry-after");
				const retryMs = retryAfter
					? Number.parseInt(retryAfter, 10) * 1000
					: DEFAULT_BACKOFF_MS;
				throw new RateLimitError(
					Number.isFinite(retryMs) ? retryMs : DEFAULT_BACKOFF_MS,
				);
			}
			return response;
		} finally {
			clearTimeout(timeout);
		}
	}
}
