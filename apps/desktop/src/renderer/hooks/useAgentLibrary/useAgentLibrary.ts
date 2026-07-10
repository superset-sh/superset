import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export const AGENT_LIBRARY_QUERY_KEY = ["agent-library"] as const;
export const AGENT_LIBRARY_SCOPES_QUERY_KEY = ["agent-library-scopes"] as const;

/**
 * Definition files (Claude Code subagents + skills) across every scope on
 * the host. Cache is keyed by host URL; mutations in the Agents & Skills
 * settings page invalidate `AGENT_LIBRARY_QUERY_KEY`.
 */
export function useAgentLibraryDefinitions(hostUrl: string | null) {
	return useQuery({
		queryKey: [...AGENT_LIBRARY_QUERY_KEY, hostUrl] as const,
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return [];
			return getHostServiceClientByUrl(hostUrl).agentLibrary.list.query();
		},
	});
}

export function useAgentLibraryScopes(hostUrl: string | null) {
	return useQuery({
		queryKey: [...AGENT_LIBRARY_SCOPES_QUERY_KEY, hostUrl] as const,
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return [];
			return getHostServiceClientByUrl(hostUrl).agentLibrary.listScopes.query();
		},
	});
}

export function useAgentLibraryDefinition({
	hostUrl,
	scopeKey,
	kind,
	name,
}: {
	hostUrl: string | null;
	scopeKey: string | null;
	kind: "agent" | "skill" | null;
	name: string | null;
}) {
	return useQuery({
		queryKey: [
			...AGENT_LIBRARY_QUERY_KEY,
			"detail",
			hostUrl,
			scopeKey,
			kind,
			name,
		] as const,
		enabled: !!hostUrl && !!scopeKey && !!kind && !!name,
		queryFn: () => {
			if (!hostUrl || !scopeKey || !kind || !name) return null;
			return getHostServiceClientByUrl(hostUrl).agentLibrary.get.query({
				scopeKey,
				kind,
				name,
			});
		},
	});
}
