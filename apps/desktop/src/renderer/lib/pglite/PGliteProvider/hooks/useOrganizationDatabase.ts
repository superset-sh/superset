import { useEffect, useRef, useState } from "react";
import {
	closeOrganizationDatabase,
	type DrizzleDB,
	openOrganizationDatabase,
	type PGliteWithExtensions,
} from "../../database";
import { startSync } from "../../sync";

interface DatabaseState {
	pg: PGliteWithExtensions;
	db: DrizzleDB;
}

/**
 * Manages PGlite database + Electric sync for a specific organization.
 * Database instances are cached to handle React StrictMode double-invocation.
 */
export function useOrganizationDatabase(
	organizationId: string,
	accessToken: string | null,
): DatabaseState | null {
	const [state, setState] = useState<DatabaseState | null>(null);
	const syncRef = useRef<{ unsubscribe: () => void } | null>(null);
	const prevOrgIdRef = useRef<string | null>(null);

	// DB lifecycle - only depends on organizationId
	// DB is cached in database.ts, so StrictMode double-invoke is safe
	useEffect(() => {
		let cancelled = false;

		// Close previous org's DB if we're actually switching orgs
		const prevOrgId = prevOrgIdRef.current;
		if (prevOrgId && prevOrgId !== organizationId) {
			closeOrganizationDatabase(prevOrgId);
		}
		prevOrgIdRef.current = organizationId;

		openOrganizationDatabase(organizationId).then((result) => {
			if (cancelled) return;
			setState(result);
		});

		return () => {
			cancelled = true;
			syncRef.current?.unsubscribe();
			syncRef.current = null;
			setState(null);
		};
	}, [organizationId]);

	// Sync lifecycle - depends on state + accessToken
	useEffect(() => {
		if (!state || !accessToken) return;

		startSync(state.pg, accessToken, organizationId).then((sync) => {
			syncRef.current = sync;
		});

		return () => {
			syncRef.current?.unsubscribe();
			syncRef.current = null;
		};
	}, [state, accessToken, organizationId]);

	return state;
}
