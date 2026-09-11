import { COMPANY } from "@superset/shared/constants";
import type { DesktopNotice } from "@superset/shared/desktop-notices";
import { type ReactNode, useCallback, useState } from "react";
import { openUrl } from "@/lib/open-url";
import {
	APP_VERSION,
	useClientNotices,
} from "@/screens/RootLayout/hooks/useClientNotices";
import { useOtaUpdates } from "@/screens/RootLayout/hooks/useOtaUpdates";
import { NoticeDialog } from "./components/NoticeDialog";
import { UpdateRequiredScreen } from "./components/UpdateRequiredScreen";

/**
 * Server-driven notices from `/api/mobile/version`. A blocking notice
 * replaces the app; a softer one is a dialog over it. A dismissible notice
 * stays dismissed; one that is not comes back on the next launch, since a
 * phone cannot hold the user in a modal the way desktop does.
 */
export function ClientNoticesGate({ children }: { children: ReactNode }) {
	const { current, dismiss } = useClientNotices();
	const { installUpdate } = useOtaUpdates();
	const [closedId, setClosedId] = useState<string | null>(null);

	const close = useCallback(
		(notice: DesktopNotice) => {
			if (notice.dismissible) dismiss(notice.id);
			else setClosedId(notice.id);
		},
		[dismiss],
	);

	const runCta = useCallback(
		(notice: DesktopNotice) => {
			const cta = notice.cta;
			if (!cta) return;
			if (cta.action === "open-url") {
				if (cta.url) openUrl(cta.url);
			} else {
				void installUpdate().then((applied) => {
					if (!applied) openUrl(COMPANY.APP_STORE_URL);
				});
			}
			if (notice.severity !== "blocking") close(notice);
		},
		[close, installUpdate],
	);

	if (current?.severity === "blocking") {
		return (
			<UpdateRequiredScreen
				notice={current}
				currentVersion={APP_VERSION}
				onCta={() => runCta(current)}
			/>
		);
	}

	return (
		<>
			{children}
			{current && current.id !== closedId && (
				<NoticeDialog
					notice={current}
					onClose={() => close(current)}
					onCta={() => runCta(current)}
				/>
			)}
		</>
	);
}
