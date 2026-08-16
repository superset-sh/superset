export const HOST_AGENT_CAPABILITY_SNAPSHOT_QUERY_KEY = [
	"host-agent-capability-snapshots",
] as const;

export const HOST_AGENT_CAPABILITY_REFRESH_QUERY_KEY = [
	"host-agent-capability-refresh",
] as const;

export function hostAgentCapabilitySnapshotQueryKey(hostUrl: string | null) {
	return [...HOST_AGENT_CAPABILITY_SNAPSHOT_QUERY_KEY, hostUrl] as const;
}

export function hostAgentCapabilityRefreshQueryKey(hostUrl: string | null) {
	return [...HOST_AGENT_CAPABILITY_REFRESH_QUERY_KEY, hostUrl] as const;
}
