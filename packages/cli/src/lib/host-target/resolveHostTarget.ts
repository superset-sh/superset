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
						headers: { Authorization: `Bearer ${manifest.authToken}` },
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
					headers: { Authorization: `Bearer ${options.userJwt}` },
				}),
			],
		}),
	};
}
