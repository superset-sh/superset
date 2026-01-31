import { useCallback, useEffect, useRef, useState } from "react";
import { env } from "renderer/env.renderer";
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
			const response = await fetch(
				`${env.NEXT_PUBLIC_API_URL}/api/desktop/version`,
			);

			if (!response.ok) {
				// Fail open - if API is down, don't block users
				setState({
					isLoading: false,
					isBlocked: false,
					requirements: null,
					error: null,
				});
				return;
			}

			const requirements: VersionRequirements = await response.json();
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
			// Fail open on network errors
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
