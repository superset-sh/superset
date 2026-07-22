import { CLIError } from "@superset/cli-framework";
import type { AppRouter as HostServiceRouter } from "@superset/host-service/trpc";
import { getHostId } from "@superset/shared/host-info";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import { env } from "../env";
import { isProcessAlive, readManifest } from "../host/manifest";

export type HostServiceClient = ReturnType<
	typeof createTRPCClient<HostServiceRouter>
>;

export type ResolvedHostTarget =
	| {
			kind: "local";
			hostId: string;
			client: HostServiceClient;
	  }
	| {
			kind: "remote";
			hostId: string;
			client: HostServiceClient;
	  };

export interface ResolveHostTargetOptions {
	requestedHostId: string | undefined;
	organizationId: string;
	userJwt: string;
}

/**
 * Fetch wrapper for tRPC links, which call `response.json()` unconditionally
 * (through 11.18.0). When a proxy or CDN in front of the relay answers with a
 * plain-text or HTML error page (e.g. Vercel's `DEPLOYMENT_NOT_FOUND`), that
 * parse crashes with `Unexpected token 'T', "The deploy"... is not valid JSON`
 * and the raw SyntaxError reaches the user. This throws a readable HTTP error
 * instead.
 */
type FetchLike = (
	input: Parameters<typeof fetch>[0],
	init?: RequestInit,
) => Promise<Response>;

function createJsonGuardedFetch(): FetchLike {
	return async (input, init) => {
		const response = await fetch(input, init);
		const contentType = response.headers.get("content-type") ?? "";
		if (response.status === 204 || contentType.includes("json")) {
			return response;
		}
		const body = (await response.text()).replace(/\s+/g, " ").trim();
		const detail = body ? `: ${body.slice(0, 160)}` : "";
		throw new Error(
			`${requestOrigin(input)} returned non-JSON (HTTP ${response.status})${detail}`,
		);
	};
}

function requestOrigin(input: Parameters<typeof fetch>[0]): string {
	const url =
		typeof input === "string"
			? input
			: input instanceof URL
				? input.href
				: input.url;
	try {
		return new URL(url).origin;
	} catch {
		return url;
	}
}

export function resolveHostTarget(
	options: ResolveHostTargetOptions,
): ResolvedHostTarget {
	const localHostId = getHostId();
	const targetHostId = options.requestedHostId ?? localHostId;

	if (targetHostId === localHostId) {
		const manifest = readManifest(options.organizationId);
		if (!manifest) {
			throw new CLIError(
				"Host service for this machine isn't running",
				"Run: superset start",
			);
		}
		if (!isProcessAlive(manifest.pid)) {
			throw new CLIError(
				"Host service manifest is stale (recorded PID is dead)",
				"Run: superset start",
			);
		}
		return {
			kind: "local",
			hostId: localHostId,
			client: createTRPCClient<HostServiceRouter>({
				links: [
					httpBatchLink({
						url: `${manifest.endpoint}/trpc`,
						transformer: SuperJSON,
						headers: {
							Authorization: `Bearer ${manifest.authToken}`,
							"x-superset-client-machine-id": localHostId,
						},
						fetch: createJsonGuardedFetch(),
					}),
				],
			}),
		};
	}

	const routingKey = buildHostRoutingKey(options.organizationId, targetHostId);
	return {
		kind: "remote",
		hostId: targetHostId,
		client: createTRPCClient<HostServiceRouter>({
			links: [
				httpBatchLink({
					url: `${env.RELAY_URL}/hosts/${routingKey}/trpc`,
					transformer: SuperJSON,
					headers: {
						Authorization: `Bearer ${options.userJwt}`,
						"x-superset-client-machine-id": localHostId,
					},
					fetch: createJsonGuardedFetch(),
				}),
			],
		}),
	};
}
