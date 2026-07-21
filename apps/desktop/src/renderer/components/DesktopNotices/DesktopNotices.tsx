import type { ReactNode } from "react";
import { UpdateRequiredPage } from "renderer/components/UpdateRequiredPage";
import { useDesktopNotices } from "renderer/hooks/useDesktopNotices";
import { NoticeDialog } from "./components/NoticeDialog";

/**
 * Server-driven version notices (plans/20260720-remote-version-notices.md).
 * Blocking notices replace the app with the forced-update page; soft ones
 * render as a modal over it.
 */
export function DesktopNoticesGate({ children }: { children: ReactNode }) {
	const { current, dismiss } = useDesktopNotices();

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
