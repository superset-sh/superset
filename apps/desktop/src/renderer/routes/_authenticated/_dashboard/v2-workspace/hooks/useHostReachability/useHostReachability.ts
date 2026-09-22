import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { HostConnectionStatus } from "@superset/workspace-client";
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import { useDelayElapsed } from "renderer/hooks/useDelayElapsed";
import { getHostEventBus } from "renderer/lib/host-event-bus";

/**
 * How long the host has to stay down before the workspace says anything at
 * all. Under this a dropped socket is indistinguishable from an ordinary
 * redial, and announcing it would flicker a notice on every relay blip.
 */
const DEGRADED_GRACE_MS = 2_000;

export interface HostReachability {
	/** Down long enough to show a non-blocking notice. */
	isDegraded: boolean;
	/** The relay definitively rejected access; report this without a grace period. */
	isAccessDenied: boolean;
	/** A dial is in flight right now (auto-backoff or a manual retry). */
	isReconnecting: boolean;
	/**
	 * The socket has opened at least once for this caller, so a drop is a
	 * reconnect rather than a first connection that hasn't landed yet.
	 */
	hasConnected: boolean;
	/** What the relay preflight says is wrong. Shown on demand in connection details. */
	detail: string;
	/** Dial now instead of waiting out the backoff. */
	retry: () => void;
}

function describeFailure(
	status: HostConnectionStatus,
	isRelayHost: boolean,
): string {
	if (!isRelayHost) {
		return i18n._(
			msg({
				message:
					"Try again, or restart the host service from the Superset tray menu.",
			}),
		);
	}
	const probe = status.probe;
	// No probe result at all: the relay itself never answered.
	if (!probe) {
		return i18n._(
			msg({
				message: "Please check your internet connection and try again.",
			}),
		);
	}
	if (probe.status === 503) {
		return i18n._(
			msg({
				message: "Make sure the device is awake, online, and running Superset.",
			}),
		);
	}
	if (probe.status === 401 || probe.status === 403) {
		return i18n._(
			msg({
				message: "Check your access under Settings > Security on that device.",
			}),
		);
	}
	if (probe.status === 502 || probe.status === 504) {
		return i18n._(
			msg({
				message: "We couldn't reach the device. Please try again in a moment.",
			}),
		);
	}
	if (probe.status === 200) {
		return i18n._(
			msg({
				message: "Please try again, or restart Superset on that device.",
			}),
		);
	}
	return i18n._({
		...msg({
			message: "Couldn't connect (error {status}). Please try again.",
		}),
		values: { status: probe.status },
	});
}

/**
 * Live reachability of the host serving this workspace, read off the shared
 * event-bus socket — the same connection the workspace's own data flows over,
 * so it reflects what the UI can actually do rather than the cloud's `isOnline`
 * flag (which drifts through relay redeploys and API blips).
 */
export function useHostReachability(hostUrl: string): HostReachability {
	const bus = useMemo(() => getHostEventBus(hostUrl), [hostUrl]);
	// Keep observing recovery even when no pane subscribes to host events.
	useEffect(() => bus.retain(), [bus]);

	const status = useSyncExternalStore(
		useCallback((onChange) => bus.subscribeConnectionStatus(onChange), [bus]),
		() => bus.getConnectionStatus(),
	);

	const isDown = status.state !== "open";
	const [hasConnected, setHasConnected] = useState(false);
	useEffect(() => {
		if (!isDown) setHasConnected(true);
	}, [isDown]);

	const isDegraded = useDelayElapsed(isDown, DEGRADED_GRACE_MS);
	// A 403 is definitive: redialling cannot restore missing permissions.
	const isAccessDenied = isDown && status.probe?.status === 403;
	const isRelayHost = /\/hosts\/[^/]+/.test(hostUrl);

	return {
		isDegraded,
		isAccessDenied,
		isReconnecting: isDown && status.state !== "closed",
		hasConnected,
		detail: describeFailure(status, isRelayHost),
		retry: () => bus.reconnect(),
	};
}
