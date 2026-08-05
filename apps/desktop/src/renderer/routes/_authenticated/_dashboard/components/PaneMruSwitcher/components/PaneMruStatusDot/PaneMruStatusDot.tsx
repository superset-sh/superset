import { useV2SourcesNotificationStatus } from "renderer/hooks/host-service/useV2NotificationStatus";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import type { PaneMruEntry } from "renderer/stores/pane-mru";
import {
	getV2TerminalNotificationSource,
	type V2NotificationSource,
} from "renderer/stores/v2-notifications";

const NO_SOURCES: V2NotificationSource[] = [];

/**
 * Agent status for one row — green when a session is done and ready for
 * review, amber while it works, red when it needs input or failed.
 *
 * A component rather than a value on the entry so the status stays live: it is
 * derived from host-service agent bindings keyed by workspace, which resolve
 * for ANY workspace, not just the mounted one. Recording it would freeze a
 * value that changes constantly.
 *
 * Only terminal panes have agent status; everything else renders nothing.
 */
export function PaneMruStatusDot({ entry }: { entry: PaneMruEntry }) {
	const sources = entry.terminalId
		? [getV2TerminalNotificationSource(entry.terminalId)]
		: NO_SOURCES;
	const status = useV2SourcesNotificationStatus(entry.workspaceId, sources);

	if (!status) return null;
	return <StatusIndicator status={status} className="shrink-0" />;
}
