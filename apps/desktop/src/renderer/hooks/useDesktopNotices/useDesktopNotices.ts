import {
	type DesktopNotice,
	desktopVersionResponseSchema,
	filterApplicableNotices,
} from "@superset/shared/desktop-notices";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { env } from "renderer/env.renderer";
import { useAppVersionHistoryStore } from "renderer/stores/app-version-history";
import { useDesktopNoticeDismissalsStore } from "renderer/stores/desktop-notice-dismissals";
import { useDesktopNoticePreviewStore } from "renderer/stores/desktop-notice-preview";
import { lt, prerelease } from "semver";

const REFETCH_INTERVAL_MS = 30 * 60 * 1000;

/** Synthesized from the legacy `minimumVersion` field so old constant bumps
 * flow through the same notice surface. */
const MINIMUM_VERSION_NOTICE_ID = "minimum-version";

function getChannel(version: string): "stable" | "canary" {
	return prerelease(version)?.length ? "canary" : "stable";
}

interface UseDesktopNoticesResult {
	/** Highest-severity applicable notice to show on poll/boot, if any. */
	current: DesktopNotice | null;
	/** Applicable `pre-update` notice to confirm before installing an update. */
	preUpdateNotice: DesktopNotice | null;
	dismiss: (noticeId: string) => void;
}

export function useDesktopNotices(): UseDesktopNoticesResult {
	const dismissedAt = useDesktopNoticeDismissalsStore((s) => s.dismissedAt);
	const storeDismiss = useDesktopNoticeDismissalsStore((s) => s.dismiss);
	const previousVersion = useAppVersionHistoryStore((s) => s.previousVersion);
	const recordBoot = useAppVersionHistoryStore((s) => s.recordBoot);
	// Dev-only forced preview (command palette). Inert in production.
	const previewNotice = useDesktopNoticePreviewStore((s) => s.preview);
	const setPreview = useDesktopNoticePreviewStore((s) => s.setPreview);
	const preview = env.NODE_ENV === "development" ? previewNotice : null;

	useEffect(() => {
		recordBoot(window.App.appVersion);
	}, [recordBoot]);

	const dismiss = useCallback(
		(noticeId: string) => {
			if (preview?.id === noticeId) {
				setPreview(null);
				return;
			}
			storeDismiss(noticeId);
		},
		[preview, setPreview, storeDismiss],
	);

	// Fails open: any fetch/parse error just means no notices this cycle.
	const { data } = useQuery({
		queryKey: ["desktop-notices"],
		queryFn: async () => {
			const response = await fetch(
				`${env.NEXT_PUBLIC_API_URL}/api/desktop/version`,
			);
			if (!response.ok) {
				throw new Error(`desktop version check failed: ${response.status}`);
			}
			return desktopVersionResponseSchema.parse(await response.json());
		},
		refetchInterval: REFETCH_INTERVAL_MS,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});

	const applicable = useMemo(() => {
		if (!data) return [];
		const appVersion = window.App.appVersion;

		const notices: DesktopNotice[] = [...data.notices];
		if (lt(appVersion, data.minimumVersion)) {
			notices.push({
				id: MINIMUM_VERSION_NOTICE_ID,
				severity: "blocking",
				trigger: "immediate",
				title: "Update required",
				body: data.message,
				cta: { label: "Install & restart", action: "install-update" },
				dismissible: false,
			});
		}

		return filterApplicableNotices(notices, {
			appVersion,
			platform: window.App.platform,
			channel: getChannel(appVersion),
			previousVersion,
			isDismissed: (id) => id in dismissedAt,
		});
	}, [data, dismissedAt, previousVersion]);

	// A dev preview overrides its matching surface; everything else falls back
	// to the real server-derived notices.
	const isPreUpdatePreview = preview?.trigger === "pre-update";
	return {
		// post-update announcements share the boot/poll popup surface
		current: isPreUpdatePreview
			? (applicable.find((n) => n.trigger !== "pre-update") ?? null)
			: (preview ?? applicable.find((n) => n.trigger !== "pre-update") ?? null),
		preUpdateNotice: isPreUpdatePreview
			? preview
			: (applicable.find((n) => n.trigger === "pre-update") ?? null),
		dismiss,
	};
}
