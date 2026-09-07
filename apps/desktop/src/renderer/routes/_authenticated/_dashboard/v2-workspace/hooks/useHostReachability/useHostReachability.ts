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

/**
 * How long the host has to stay unreachable before the workspace hands over to
 * the unreachable screen. The socket reconnects on its own backoff, so a relay
 * redeploy, a laptop lid, or a half-open TCP flap resolves well inside this
 * window — taking the screen over for those would be the false-positive that
 * got the earlier cloud-presence gate reverted twice (#4430, #4727).
 */
const UNREACHABLE_GRACE_MS = 10_000;

/**
 * While the host is down, dial on this cadence instead of riding the socket's
 * own backoff. That backoff grows to 30s, so a host that came back could sit
 * behind "Reconnecting…" for half a minute — measured at 20.7s — which reads
 * as broken next to copy promising the workspace returns with the connection.
 * Only runs while the host is down, so it can't hammer a healthy host.
 */
const REDIAL_INTERVAL_MS = 5_000;

export interface HostReachabilityOptions {
	/**
	 * How long the host may stay down before `isUnreachable`. Callers that know
	 * the outage is expected and self-healing (the local host service mid-
	 * restart) hold the takeover longer; `isDegraded` keeps the user informed
	 * in the meantime.
	 */
	unreachableAfterMs?: number;
}

export interface HostReachability {
	/**
	 * Down long enough to say so, not long enough to take the screen over.
	 * Panes stay usable; show a non-blocking notice.
	 */
	isDegraded: boolean;
	/** Sustained loss of the host connection — safe to take the screen over. */
	isUnreachable: boolean;
	/** A dial is in flight right now (auto-backoff or a manual retry). */
	isReconnecting: boolean;
	/**
	 * The socket has opened at least once for this caller, so a drop is a
	 * reconnect rather than a first connection that hasn't landed yet.
	 */
	hasConnected: boolean;
	/** What the relay preflight says is wrong. Only read while unreachable. */
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
					"The local host service stopped answering. Retry first; if that doesn't take, restart it from the Superset tray menu > Host Service > Restart.",
			}),
		);
	}
	const probe = status.probe;
	// No probe result at all: the relay itself never answered.
	if (!probe) {
		return i18n._(
			msg({
				message:
					"Couldn't reach the relay service. Check this machine's network connection — the other device is probably fine.",
			}),
		);
	}
	if (probe.status === 503) {
		return i18n._(
			msg({
				message:
					"That device isn't connected to the relay. Check it's awake, online, and running Superset — it reconnects on its own once it is.",
			}),
		);
	}
	if (probe.status === 401 || probe.status === 403) {
		return i18n._(
			msg({
				message:
					"You don't have access to this host. If it's your own device, turn on relay access there under Settings > Security.",
			}),
		);
	}
	if (probe.status === 502 || probe.status === 504) {
		return i18n._(
			msg({
				message:
					"The relay couldn't reach that device right now. This is usually temporary — retrying in a moment normally works.",
			}),
		);
	}
	if (probe.status === 200) {
		return i18n._(
			msg({
				message:
					"That device is online but the connection couldn't be established — usually relay routing rather than the device itself. Retry, and if it persists restart Superset on that device.",
			}),
		);
	}
	return i18n._({
		...msg({
			message:
				"The connection failed (relay status {status}). Retry, and if it persists restart Superset on that device.",
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
export function useHostReachability(
	hostUrl: string,
	{ unreachableAfterMs = UNREACHABLE_GRACE_MS }: HostReachabilityOptions = {},
): HostReachability {
	const bus = useMemo(() => getHostEventBus(hostUrl), [hostUrl]);
	// Hold the connection open for as long as this screen is mounted: the
	// panes that normally keep the bus alive are gone once we take over, and a
	// closed socket would never observe the host coming back.
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
	const graceElapsed = useDelayElapsed(isDown, unreachableAfterMs);
	// A 403 preflight is definitive — the relay only 403s a verified token, so
	// no amount of redialling changes the answer. Waiting out the grace there
	// only delays telling the user they lack access.
	const isUnreachable =
		graceElapsed || (isDown && status.probe?.status === 403);
	const isRelayHost = /\/hosts\/[^/]+/.test(hostUrl);

	useEffect(() => {
		if (!isDegraded) return;
		const timer = window.setInterval(() => bus.reconnect(), REDIAL_INTERVAL_MS);
		return () => window.clearInterval(timer);
	}, [isDegraded, bus]);

	return {
		isDegraded,
		isUnreachable,
		isReconnecting: isDown && status.state !== "closed",
		hasConnected,
		detail: describeFailure(status, isRelayHost),
		retry: () => bus.reconnect(),
	};
}
