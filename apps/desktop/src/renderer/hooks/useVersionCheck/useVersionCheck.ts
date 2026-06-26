import { useCallback, useEffect, useRef, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { lt } from "semver";

interface VersionRequirements {
	minimumVersion: string;
	message?: string;
}

interface UseVersionCheckResult {
	isLoading: boolean;
	isBlocked: boolean;
	requirements: VersionRequirements | null;
	error: Error | null;
}

export function useVersionCheck(): UseVersionCheckResult {
	const [state, setState] = useState<UseVersionCheckResult>({
		isLoading: true,
		isBlocked: false,
		requirements: null,
		error: null,
	});

	// Track if we've successfully verified the version
	const hasVerified = useRef(false);

	const checkVersion = useCallback(async () => {
		// Don't show loading state on re-checks (only on initial load)
		if (!hasVerified.current) {
			setState((prev) => ({ ...prev, isLoading: true }));
		}

		try {
			const requirements = await apiTrpcClient.desktop.minimumVersion.query();
			const currentVersion = window.App.appVersion;
			const isBlocked = lt(currentVersion, requirements.minimumVersion);

			hasVerified.current = true;
			setState({
				isLoading: false,
				isBlocked,
				requirements,
				error: null,
			});
		} catch (error) {
			// Fail open on network/tRPC errors so a flaky API can't block users.
			setState({
				isLoading: false,
				isBlocked: false,
				requirements: null,
				error: error instanceof Error ? error : new Error("Unknown error"),
			});
		}
	}, []);

	useEffect(() => {
		// Initial check
		checkVersion();

		// Re-check when network comes back online (in case initial check failed)
		const handleOnline = () => {
			if (!hasVerified.current) {
				checkVersion();
			}
		};

		window.addEventListener("online", handleOnline);
		return () => window.removeEventListener("online", handleOnline);
	}, [checkVersion]);

	return state;
}
