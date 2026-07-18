import type { SessionsSyncClient } from "@superset/host-service-sync/client";
import { createContext, type ReactNode, useContext } from "react";

const SessionsSyncContext = createContext<SessionsSyncClient | null>(null);

/**
 * Makes a SessionsSyncClient available to the hooks in this package. The
 * provider does NOT own the client lifecycle — the app constructs the client
 * (transport, auth, URLs are app concerns) and decides when to connect and
 * disconnect; keeping one long-lived client per host across screen mounts is
 * the intended shape.
 */
export function SessionsSyncProvider({
	client,
	children,
}: {
	client: SessionsSyncClient;
	children: ReactNode;
}) {
	return (
		<SessionsSyncContext.Provider value={client}>
			{children}
		</SessionsSyncContext.Provider>
	);
}

export function useSessionsSyncClient(): SessionsSyncClient {
	const client = useContext(SessionsSyncContext);
	if (client === null) {
		throw new Error(
			"useSessionsSyncClient requires a <SessionsSyncProvider> ancestor",
		);
	}
	return client;
}
