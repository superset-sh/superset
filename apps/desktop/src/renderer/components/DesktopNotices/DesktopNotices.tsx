import { type ReactNode, useEffect } from "react";
import { UpdateRequiredPage } from "renderer/components/UpdateRequiredPage";
import { env } from "renderer/env.renderer";
import { useDesktopNotices } from "renderer/hooks/useDesktopNotices";
import { useDesktopNoticePreviewStore } from "renderer/stores/desktop-notice-preview";
import { NoticeDialog } from "./components/NoticeDialog";

/**
 * Server-driven version notices (plans/20260720-remote-version-notices.md).
 * Blocking notices replace the app with the forced-update page; soft ones
 * render as a modal over it.
 */
export function DesktopNoticesGate({ children }: { children: ReactNode }) {
	const { current, dismiss } = useDesktopNotices();
	const preview = useDesktopNoticePreviewStore((s) => s.preview);
	const setPreview = useDesktopNoticePreviewStore((s) => s.setPreview);

	// Escape clears a dev preview — the only way out of a blocking preview,
	// which replaces the app (and the command palette) full-screen.
	useEffect(() => {
		if (env.NODE_ENV !== "development" || !preview) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setPreview(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [preview, setPreview]);

	if (current?.severity === "blocking") {
		return (
			<UpdateRequiredPage
				currentVersion={window.App.appVersion}
				minimumVersion={current.minVersion ?? undefined}
				title={current.title}
				message={current.body}
			/>
		);
	}

	return (
		<>
			{children}
			{current && <NoticeDialog notice={current} onDismiss={dismiss} />}
		</>
	);
}
