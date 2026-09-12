import { useQuery } from "@tanstack/react-query";
import * as Application from "expo-application";
import { lt } from "semver";
import { z } from "zod";
import { env } from "@/lib/env";

const REFETCH_INTERVAL_MS = 30 * 60 * 1000;

export const APP_VERSION = Application.nativeApplicationVersion ?? "0.0.0";

const versionResponseSchema = z.object({
	minimumVersion: z.string(),
	message: z.string(),
});

interface VersionGate {
	minimumVersion: string;
	message: string;
}

/** The server's minimum build, when this build is below it. Fails open: no answer, no gate. */
export function useVersionGate(): VersionGate | null {
	const { data } = useQuery({
		queryKey: ["version-gate"],
		queryFn: async () => {
			const response = await fetch(
				`${env.EXPO_PUBLIC_API_URL}/api/mobile/version`,
			);
			if (!response.ok) {
				throw new Error(`mobile version check failed: ${response.status}`);
			}
			return versionResponseSchema.parse(await response.json());
		},
		refetchInterval: REFETCH_INTERVAL_MS,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});

	if (!data || !lt(APP_VERSION, data.minimumVersion)) return null;
	return data;
}
