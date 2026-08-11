import { useEffect } from "react";
import { useSession } from "@/lib/auth/client";
import { primeRelayUrl } from "@/lib/host/client";

/**
 * Resolves which relay this user's host is on (relay-url-override) once a
 * session exists, caching it for the sync host-URL builders. The Expo env is
 * the fallback until this resolves.
 */
export function usePrimeRelayUrl(): void {
	const { data: session } = useSession();

	useEffect(() => {
		if (session) void primeRelayUrl();
	}, [session]);
}
