const PLAIN_API_URL = "https://core-api.uk.plain.com/graphql/v1";
const PLAIN_REQUEST_TIMEOUT_MS = 15_000;

interface PlainGraphqlError {
	message: string;
	extensions?: { code?: string };
}

export class PlainApiError extends Error {
	readonly status: number | undefined;
	readonly code: string | undefined;

	constructor(message: string, status?: number, code?: string) {
		super(message);
		this.name = "PlainApiError";
		this.status = status;
		this.code = code;
	}
}

/**
 * Minimal GraphQL client for Plain's Core API. Plain authenticates with
 * long-lived machine-user API keys (no OAuth, no refresh flow), so unlike
 * the Linear client there is no token refresh path.
 */
export class PlainClient {
	private readonly apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async request<TData, TVariables extends Record<string, unknown>>(
		query: string,
		variables: TVariables,
	): Promise<TData> {
		const controller = new AbortController();
		const timeout = setTimeout(
			() => controller.abort(),
			PLAIN_REQUEST_TIMEOUT_MS,
		);
		let response: Response;
		try {
			response = await fetch(PLAIN_API_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				signal: controller.signal,
				body: JSON.stringify({ query, variables }),
			});
		} finally {
			clearTimeout(timeout);
		}

		if (!response.ok) {
			throw new PlainApiError(
				`Plain API request failed: ${response.status} ${response.statusText}`,
				response.status,
			);
		}

		const json = (await response.json()) as {
			data?: TData;
			errors?: PlainGraphqlError[];
		};

		const firstError = json.errors?.[0];
		if (firstError) {
			throw new PlainApiError(
				firstError.message,
				response.status,
				firstError.extensions?.code,
			);
		}
		if (!json.data) {
			throw new PlainApiError("Plain API returned no data", response.status);
		}
		return json.data;
	}
}

export function isPlainAuthError(error: unknown): boolean {
	if (!(error instanceof PlainApiError)) return false;
	if (error.status === 401 || error.status === 403) return true;
	return error.code === "UNAUTHENTICATED" || error.code === "FORBIDDEN";
}
