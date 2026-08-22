import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { CloneAccessResult } from "renderer/routes/_authenticated/components/CloneAccessStatus";

interface UseCloneAccessPlanArgs {
	hostUrl: string | null;
	repoCloneUrl: string | null;
	/** Gate both queries (e.g. only while a modal is open / a project needs setup). */
	enabled: boolean;
}

/**
 * Everything a surface needs to plan a clone onto a host: the access
 * preflight (same env a real clone uses, classified per cause) and a parent
 * directory prefilled to the host's `~/.superset/projects`. Shared by the
 * settings setup modal and the new-workspace composer.
 */
export function useCloneAccessPlan({
	hostUrl,
	repoCloneUrl,
	enabled,
}: UseCloneAccessPlanArgs) {
	const [parentDir, setParentDir] = useState("");
	const prefilledRef = useRef(false);

	// Preflight the same access a real clone would need, so a missing GitHub
	// sign-in on the host surfaces as a fix-it panel instead of a failed clone.
	const accessQuery = useQuery({
		queryKey: ["project-setup", "clone-access", hostUrl, repoCloneUrl],
		enabled: enabled && !!hostUrl && !!repoCloneUrl,
		staleTime: 30_000,
		queryFn: async (): Promise<CloneAccessResult | null> => {
			if (!hostUrl || !repoCloneUrl) return null;
			try {
				const client = getHostServiceClientByUrl(hostUrl);
				return await client.project.checkCloneAccess.query({ repoCloneUrl });
			} catch (err) {
				// Hosts older than the procedure: stay quiet rather than warn.
				if (
					err instanceof Error &&
					err.message.includes("No procedure found")
				) {
					return null;
				}
				// Anything else means we couldn't ask the host at all — say so
				// instead of hiding the check and letting the clone discover it.
				return { ok: false, reason: "unreachable", ghCli: "unknown" };
			}
		},
	});

	// Suggest the same default clone location onboarding uses, resolved
	// against the target host's home directory.
	const hostHomeQuery = useQuery({
		queryKey: ["project-setup", "host-home", hostUrl],
		enabled: enabled && !!hostUrl,
		staleTime: Number.POSITIVE_INFINITY,
		queryFn: async () => {
			if (!hostUrl) return null;
			const client = getHostServiceClientByUrl(hostUrl);
			const listing = await client.filesystem.browseHost.query({});
			return listing.homePath ?? listing.path;
		},
	});

	const home = hostHomeQuery.data;
	useEffect(() => {
		if (!enabled) {
			prefilledRef.current = false;
			return;
		}
		if (prefilledRef.current || !home) return;
		prefilledRef.current = true;
		setParentDir((current) =>
			current ? current : `${home}/.superset/projects`,
		);
	}, [enabled, home]);

	const resetParentDir = () => {
		setParentDir("");
		prefilledRef.current = false;
	};

	return {
		parentDir,
		setParentDir,
		resetParentDir,
		access: accessQuery.data ?? null,
		isCheckingAccess: accessQuery.isFetching,
		recheckAccess: () => void accessQuery.refetch(),
	};
}
