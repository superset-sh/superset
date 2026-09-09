import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import type { AppRouter } from "@superset/trpc";
import type { TRPCClient } from "@trpc/client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import { getApiUrl } from "./config";
import { env } from "./env";

export type ApiClient = TRPCClient<AppRouter>;

/**
 * A non-JSON error response from whatever sits in front of the API: Vercel's
 * 413 page, a gateway's HTML 502. tRPC would otherwise report these as
 * "Failed to parse JSON" and drop the status, leaving the user nothing to act
 * on. The body keeps its non-empty lines (Vercel's includes the request id).
 */
export class ApiHttpError extends Error {
	constructor(
		public readonly status: number,
		public readonly statusText: string,
		public readonly body: string,
	) {
		super(`HTTP ${status} ${statusText}: ${body}`.trimEnd());
		this.name = "ApiHttpError";
	}
}

const MAX_ERROR_BODY_CHARS = 300;

export async function fetchRejectingNonJsonErrors(
	input: string | URL | Request,
	init?: RequestInit,
): Promise<Response> {
	const response = await fetch(input, init);
	const contentType = response.headers.get("content-type") ?? "";
	if (response.ok || contentType.includes("json")) return response;
	const body = (await response.text())
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.join(" / ")
		.slice(0, MAX_ERROR_BODY_CHARS);
	throw new ApiHttpError(response.status, response.statusText, body);
}

/**
 * tRPC declares this type without exporting it, and bun-types' Response does
 * not satisfy its ResponseEsque (stream reader overloads), so passing even the
 * global fetch here needs the same cast.
 */
type LinkFetch = NonNullable<Parameters<typeof httpBatchLink>[0]["fetch"]>;

export function createApiClient(opts: {
	bearer: string;
	organizationId?: string;
}): ApiClient {
	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${getApiUrl()}/api/trpc`,
				transformer: SuperJSON,
				fetch: fetchRejectingNonJsonErrors as LinkFetch,
				headers() {
					// better-auth's apiKey plugin reads `sk_live_…` from the
					// x-api-key header. The Authorization: Bearer header is
					// for OAuth/JWT tokens only — sending an api key there
					// gets rejected as an invalid bearer.
					const headers: Record<string, string> = opts.bearer.startsWith(
						"sk_live_",
					)
						? { "x-api-key": opts.bearer }
						: { Authorization: `Bearer ${opts.bearer}` };
					if (opts.organizationId) {
						headers[ORGANIZATION_HEADER] = opts.organizationId;
					}
					headers["x-superset-client"] = `cli/${env.VERSION}`;
					return headers;
				},
			}),
		],
	});
}
