import { useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import {
	type DesktopNotice,
	desktopVersionResponseSchema,
	filterApplicableNotices,
} from "@superset/shared/desktop-notices";
import { useQuery } from "@tanstack/react-query";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { useCallback, useEffect, useMemo } from "react";
import { lt } from "semver";
import { env } from "@/lib/env";
import { useClientNoticesStore } from "@/screens/RootLayout/stores/clientNoticesStore";

const REFETCH_INTERVAL_MS = 30 * 60 * 1000;
const MINIMUM_VERSION_NOTICE_ID = "minimum-version";
const PLATFORM = "ios";

export const APP_VERSION = Application.nativeApplicationVersion ?? "0.0.0";

interface UseClientNoticesResult {
	/** Highest-severity applicable notice, if any; null until storage has hydrated. */
	current: DesktopNotice | null;
	dismiss: (noticeId: string) => void;
}

export function useClientNotices(): UseClientNoticesResult {
	const { t } = useLingui();
	const hasHydrated = useClientNoticesStore((s) => s.hasHydrated);
	const dismissedAt = useClientNoticesStore((s) => s.dismissedAt);
	const previousVersion = useClientNoticesStore((s) => s.previousVersion);
	const recordBoot = useClientNoticesStore((s) => s.recordBoot);
	const dismiss = useClientNoticesStore((s) => s.dismiss);

	useEffect(() => {
		if (hasHydrated) recordBoot(APP_VERSION);
	}, [hasHydrated, recordBoot]);

	const { data } = useQuery({
		queryKey: ["client-notices"],
		queryFn: async () => {
			const response = await fetch(
				`${env.EXPO_PUBLIC_API_URL}/api/mobile/version`,
			);
			if (!response.ok) {
				throw new Error(`mobile version check failed: ${response.status}`);
			}
			return desktopVersionResponseSchema.parse(await response.json());
		},
		refetchInterval: REFETCH_INTERVAL_MS,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});

	const isDismissed = useCallback(
		(id: string) => id in dismissedAt,
		[dismissedAt],
	);

	const current = useMemo(() => {
		if (!data || !hasHydrated) return null;
		const notices: DesktopNotice[] = [...data.notices];
		if (lt(APP_VERSION, data.minimumVersion)) {
			notices.push({
				id: MINIMUM_VERSION_NOTICE_ID,
				severity: "blocking",
				trigger: "immediate",
				minVersion: data.minimumVersion,
				body: data.message,
				cta: {
					label: t({ message: "Update in the App Store" }),
					action: "open-url",
					url: COMPANY.APP_STORE_URL,
				},
				dismissible: false,
			});
		}
		const applicable = filterApplicableNotices(notices, {
			appVersion: APP_VERSION,
			platform: PLATFORM,
			channel: Updates.channel ?? "development",
			previousVersion,
			isDismissed,
		});
		return applicable.find((n) => n.trigger !== "pre-update") ?? null;
	}, [data, hasHydrated, isDismissed, previousVersion, t]);

	return { current, dismiss };
}
