import type { AppRouter } from "@superset/host-service";
import { createTRPCClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import { getHostServiceHeaders } from "./host-service-auth";

const clientCache = new Map<
	string,
	ReturnType<typeof createTRPCClient<AppRouter>>
>();

export type HostServiceClient = ReturnType<typeof createTRPCClient<AppRouter>>;

export function getHostServiceClient(port: number): HostServiceClient {
	return getHostServiceClientByUrl(`http://127.0.0.1:${port}`);
}

// The local host-service URL, mirrored out of LocalHostServiceProvider so that
// the (non-React) workspace collection's queryFn can reach the local host to
// list workspaces. Null until the local host has booted.
let activeLocalHostUrl: string | null = null;
export function setActiveLocalHostUrl(url: string | null) {
	activeLocalHostUrl = url;
}
export function getActiveLocalHostUrl(): string | null {
	return activeLocalHostUrl;
}

// This machine's host id, so the workspace collection can tell its own
// (local-authoritative) workspaces apart from other hosts' cloud presence.
let activeLocalMachineId: string | null = null;
export function setActiveLocalMachineId(machineId: string | null) {
	activeLocalMachineId = machineId;
}
export function getActiveLocalMachineId(): string | null {
	return activeLocalMachineId;
}

export function getHostServiceClientByUrl(hostUrl: string): HostServiceClient {
	const cached = clientCache.get(hostUrl);
	if (cached) return cached;

	const client = createTRPCClient<AppRouter>({
		links: [
			httpLink({
				url: `${hostUrl}/trpc`,
				transformer: superjson,
				headers: () => getHostServiceHeaders(hostUrl),
			}),
		],
	});

	clientCache.set(hostUrl, client);
	return client;
}
