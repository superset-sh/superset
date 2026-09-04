import { useEffect } from "react";
import { useSession } from "@/lib/auth/client";
import { primeRelayUrl } from "@/lib/host/client";

/**
 * Asks the API which relay to use once a session exists, caching it for the
 * sync host-URL builders. The Expo env is the fallback until this resolves.
 */
export function usePrimeRelayUrl(): void {
	const { data: session } = useSession();

	useEffect(() => {
		if (session) void primeRelayUrl();
	}, [session]);
}
