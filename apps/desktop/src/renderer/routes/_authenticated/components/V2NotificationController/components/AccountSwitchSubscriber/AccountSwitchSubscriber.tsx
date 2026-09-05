import { msg, plural } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { formatPercent } from "@superset/i18n/format";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { toast } from "@superset/ui/sonner";
import type {
	AccountEngineStatePayload,
	AccountSwitchedPayload,
} from "@superset/workspace-client";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { ACCOUNT_ENGINE_QUERY_KEY } from "renderer/routes/_authenticated/settings/usage/hooks/useAccountEngineSettings";
import { invalidateHostUsageQuota } from "renderer/routes/_authenticated/settings/usage/hooks/useHostUsageQuota";
import { SWITCH_HISTORY_QUERY_KEY } from "renderer/routes/_authenticated/settings/usage/hooks/useSwitchHistory";
import type { HostNotificationWorkspaceState } from "../HostNotificationSubscriber";

type AccountAgent = AccountSwitchedPayload["agent"];

/** How far back the away summary looks. Older switches are not summarised. */
const AWAY_SUMMARY_LIMIT = 50;

/**
 * Newest switch the user has been told about, so switches made while the app
 * was closed can be summarised once on the next launch. Bounded: a single
 * epoch-ms number, overwritten in place, never keyed by entity.
 */
const LAST_SEEN_AT_KEY = "superset.accountSwitch.lastSeenAt";

/**
 * One notification per `(agent, at)`. Module-level, so the same switch
 * arriving over two host connections in this window notifies once. A second
 * desktop window is a separate renderer process and is not covered.
 */
const seenSwitchKeys = new Set<string>();
const MAX_SEEN_SWITCH_KEYS = 200;

/** Agents currently in the R22 all-exhausted state, so it notifies once per
 * episode rather than on every engine-state broadcast. */
const exhaustedAgents = new Set<AccountAgent>();

/** Last "needs attention" session reported per agent, same reasoning. */
const needsAttentionKeys = new Map<AccountAgent, string>();

/** Hosts whose away summary already ran in this renderer. */
const summarisedHosts = new Set<string>();

/**
 * Turns the engine's structured account events into what the user actually
 * sees: a native notification per switch (R19), the exhaustion and
 * needs-attention notices (R22, KTD8), live Usage-page updates, and one
 * summary toast for switches that happened while the app was closed.
 *
 * The host sends ids, labels and numbers only — every sentence below is
 * composed and translated here (KTD6). Sibling of `HostNotificationSubscriber`
 * and mounted the same way, one per host-service URL.
 */
/** Reads the switch history for the away summary; injectable for tests. */
export type LoadSwitchHistory = (
	hostUrl: string,
) => Promise<{ entries: Array<{ at: number; reasonKind: string }> }>;

const loadSwitchHistoryFromHost: LoadSwitchHistory = (hostUrl) =>
	getHostServiceClientByUrl(hostUrl).usage.engine.history.query({
		limit: AWAY_SUMMARY_LIMIT,
	});

export function AccountSwitchSubscriber({
	hostUrl,
	workspaces,
	loadHistory = loadSwitchHistoryFromHost,
}: {
	hostUrl: string;
	workspaces: HostNotificationWorkspaceState[];
	loadHistory?: LoadSwitchHistory;
}): null {
	const queryClient = useQueryClient();

	const handleSwitched = useEffectEvent(
		(_agent: string, payload: AccountSwitchedPayload) => {
			// Always: the active account changed even when the user did it
			// themselves, so the page must not keep showing the old one.
			void invalidateAccountQueries(queryClient, hostUrl);
			rememberLastSeenAt(payload.at);

			if (!markSwitchSeen(`${payload.agent}:${payload.at}`)) return;
			const content = getSwitchNotification(payload);
			if (!content) return;
			showNative(content);
		},
	);

	const handleEngineState = useEffectEvent(
		(_agent: string, payload: AccountEngineStatePayload) => {
			void queryClient.invalidateQueries({
				queryKey: [...ACCOUNT_ENGINE_QUERY_KEY, hostUrl],
			});
			notifyExhaustion(payload);
			notifyNeedsAttention(payload, workspaces);
		},
	);

	useEffect(() => {
		const bus = getHostEventBus(hostUrl);
		const removeSwitchedListener = bus.on(
			"account:switched",
			"*",
			handleSwitched,
		);
		const removeEngineStateListener = bus.on(
			"account:engine-state",
			"*",
			handleEngineState,
		);
		const release = bus.retain();

		return () => {
			removeSwitchedListener();
			removeEngineStateListener();
			release();
		};
	}, [hostUrl]);

	useEffect(() => {
		void showAwaySummary(hostUrl, loadHistory);
	}, [hostUrl, loadHistory]);

	return null;
}

function invalidateAccountQueries(
	queryClient: QueryClient,
	hostUrl: string,
): Promise<unknown> {
	return Promise.all([
		invalidateHostUsageQuota(queryClient, hostUrl),
		queryClient.invalidateQueries({
			queryKey: [...ACCOUNT_ENGINE_QUERY_KEY, hostUrl],
		}),
		queryClient.invalidateQueries({
			queryKey: [...SWITCH_HISTORY_QUERY_KEY, hostUrl],
		}),
	]);
}

function markSwitchSeen(key: string): boolean {
	if (seenSwitchKeys.has(key)) return false;
	seenSwitchKeys.add(key);
	if (seenSwitchKeys.size > MAX_SEEN_SWITCH_KEYS) {
		const oldest = seenSwitchKeys.values().next().value;
		if (oldest !== undefined) seenSwitchKeys.delete(oldest);
	}
	return true;
}

/**
 * The sentence for one switch, or null when the user needs no telling: a
 * manual switch is their own action, and the confirmation is the Usage page
 * updating under their hands.
 */
function getSwitchNotification(
	payload: AccountSwitchedPayload,
): { title: string; body: string } | null {
	if (payload.reasonKind === "manual") return null;

	const agent = getAgentLabel(payload.agent);
	const { fromLabel, toLabel } = payload;
	const title =
		toLabel && fromLabel
			? i18n._(
					msg({ message: `${agent} switched from ${fromLabel} to ${toLabel}` }),
				)
			: toLabel
				? i18n._(msg({ message: `${agent} switched to ${toLabel}` }))
				: i18n._(msg({ message: `${agent} switched account` }));

	return { title, body: getSwitchReason(payload) };
}

function getSwitchReason(payload: AccountSwitchedPayload): string {
	switch (payload.reasonKind) {
		case "threshold": {
			if (payload.windowId === null || payload.usedPercent === null) {
				return i18n._(msg({ message: "Approaching the usage limit" }));
			}
			const windowLabel = getWindowLabel(payload.windowId);
			const percent = formatPercent(payload.usedPercent / 100, {
				maximumFractionDigits: 0,
			});
			return i18n._(msg({ message: `${windowLabel} at ${percent}` }));
		}
		case "strategy":
			return i18n._(msg({ message: "Switched by the consume-first strategy" }));
		case "fallback":
			return i18n._(msg({ message: "Fallback restart after a usage limit" }));
		case "external":
			return i18n._(msg({ message: "Login changed outside Superset" }));
		default:
			return "";
	}
}

const WEEKLY_SCOPED_PREFIX = "weekly_scoped:";

function getWindowLabel(windowId: string): string {
	if (windowId === "five_hour" || windowId === "primary") {
		return i18n._(msg({ message: "5-hour window" }));
	}
	if (windowId === "seven_day" || windowId === "secondary") {
		return i18n._(msg({ message: "weekly window" }));
	}
	if (windowId.startsWith(WEEKLY_SCOPED_PREFIX)) {
		const model = windowId.slice(WEEKLY_SCOPED_PREFIX.length);
		return i18n._(msg({ message: `${model} weekly window` }));
	}
	return windowId;
}

function getAgentLabel(agent: AccountAgent): string {
	return AGENT_IDENTITY_LABELS[agent] ?? agent;
}

/** R22: told once per episode, and again only after the engine recovers. */
function notifyExhaustion(payload: AccountEngineStatePayload): void {
	if (!payload.exhausted) {
		exhaustedAgents.delete(payload.agent);
		return;
	}
	if (exhaustedAgents.has(payload.agent)) return;
	exhaustedAgents.add(payload.agent);

	const agent = getAgentLabel(payload.agent);
	showNative({
		title: i18n._(msg({ message: `All ${agent} accounts are at their limit` })),
		body: i18n._(
			msg({ message: "Switching resumes when a usage window resets." }),
		),
	});
}

/** KTD8: a session the engine could not move on its own. */
function notifyNeedsAttention(
	payload: AccountEngineStatePayload,
	workspaces: HostNotificationWorkspaceState[],
): void {
	const target = payload.needsAttention;
	if (!target) {
		needsAttentionKeys.delete(payload.agent);
		return;
	}
	const key = `${target.workspaceId}:${target.terminalId}:${target.reason}`;
	if (needsAttentionKeys.get(payload.agent) === key) return;
	needsAttentionKeys.set(payload.agent, key);

	const agent = getAgentLabel(payload.agent);
	const workspace = workspaces.find(
		(candidate) => candidate.workspaceId === target.workspaceId,
	);
	showNative({
		title: i18n._(msg({ message: `A ${agent} session needs attention` })),
		body: workspace?.workspaceName ?? target.workspaceId,
		clickTarget: {
			workspaceId: target.workspaceId,
			source: { type: "terminal", id: target.terminalId },
		},
	});
}

function showNative(input: {
	title: string;
	body: string;
	clickTarget?: {
		workspaceId: string;
		source: { type: "terminal"; id: string };
	};
}): void {
	void electronTrpcClient.notifications.showNative
		.mutate({ silent: true, ...input })
		.catch((error) => {
			console.warn("[accounts] failed to show switch notification:", error);
		});
}

/**
 * One toast for the switches that happened while the desktop was closed.
 * Runs once per host per renderer; the marker is host-wide, so with several
 * hosts the first one to report wins and the rest stay silent rather than
 * stacking toasts.
 */
async function showAwaySummary(
	hostUrl: string,
	loadHistory: LoadSwitchHistory,
): Promise<void> {
	if (summarisedHosts.has(hostUrl)) return;
	summarisedHosts.add(hostUrl);

	const lastSeenAt = readLastSeenAt();
	try {
		const { entries } = await loadHistory(hostUrl);

		rememberLastSeenAt(...entries.map((entry) => entry.at));
		// `fallback-rejected` rows are refused hints, not switches.
		const count = entries.filter(
			(entry) =>
				entry.at > lastSeenAt && entry.reasonKind !== "fallback-rejected",
		).length;
		if (count === 0) return;

		toast.info(
			i18n._(
				msg({
					message: plural(count, {
						one: "# account switch while you were away",
						other: "# account switches while you were away",
					}),
				}),
			),
		);
	} catch (error) {
		// A host that was unreachable at boot gets another chance on remount.
		summarisedHosts.delete(hostUrl);
		console.warn("[accounts] failed to read the switch history:", error);
	}
}

function readLastSeenAt(): number {
	try {
		const raw = localStorage.getItem(LAST_SEEN_AT_KEY);
		const parsed = raw === null ? 0 : Number(raw);
		return Number.isFinite(parsed) ? parsed : 0;
	} catch {
		return 0;
	}
}

function rememberLastSeenAt(...timestamps: number[]): void {
	const newest = Math.max(0, ...timestamps);
	if (newest <= readLastSeenAt()) return;
	try {
		localStorage.setItem(LAST_SEEN_AT_KEY, String(newest));
	} catch {
		// A blocked or full localStorage only costs a repeated summary.
	}
}
