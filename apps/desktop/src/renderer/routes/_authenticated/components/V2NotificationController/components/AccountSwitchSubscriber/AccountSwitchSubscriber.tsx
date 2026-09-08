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
import { windowLabel as getWindowLabel } from "renderer/routes/_authenticated/utils/windowLabel";
import type { HostNotificationWorkspaceState } from "../HostNotificationSubscriber";
import { switchFailureMessage } from "./utils/switchFailureMessage";

type AccountAgent = AccountSwitchedPayload["agent"];

/** How far back the away summary looks. Older switches are not summarised. */
const AWAY_SUMMARY_LIMIT = 50;

/**
 * Newest switch the user has been told about *per host*, so switches made
 * while the app was closed can be summarised once on the next launch. One
 * subscriber mounts per host, so a renderer-wide number let a second host's
 * newer timestamp swallow the first host's summary. Bounded: a
 * `{ [hostUrl]: epochMs }` map capped to `MAX_WATERMARK_HOSTS` entries, the
 * host being written plus the newest of the rest.
 */
const LAST_SEEN_AT_KEY = "superset.accountSwitch.lastSeenAt";
const MAX_WATERMARK_HOSTS = 8;

/**
 * One notification per `(hostUrl, agent, at)`. Module-level, so the same
 * switch replayed on one host's connection in this window notifies once —
 * host-scoped, because two hosts switching the same agent at the same
 * timestamp are two real events. A second desktop window is a separate
 * renderer process and is not covered.
 */
const seenSwitchKeys = new Set<string>();
const MAX_SEEN_SWITCH_KEYS = 200;

/** Agents currently in the R22 all-exhausted state, so it notifies once per
 * episode rather than on every engine-state broadcast. Keyed by
 * `${hostUrl}|${agent}`: engine state is per host, so one host's episode must
 * not silence another's. */
const exhaustedAgents = new Set<string>();

/** Last "needs attention" session reported per host and agent, same
 * reasoning. */
const needsAttentionKeys = new Map<string, string>();

/**
 * The switch-failure code the user was last told about, per host and agent.
 * The engine mints a fresh `at` on every failed attempt and re-broadcasts on
 * every poll, so the timestamp cannot carry this dedupe — keying on it meant a
 * failure that keeps failing raised a native notification per poll, forever.
 *
 * Cleared on a positive recovery signal only: a completed switch for that host
 * and agent, or a different code. Never on `lastSwitchFailure` being absent
 * from a payload — the steady-state broadcast routinely omits it, so clearing
 * on absence would re-arm the storm on the next tick.
 */
const lastFailureCodes = new Map<string, string>();

/** Per-host, per-agent latch key for the engine-state notices. */
function latchKey(hostUrl: string, agent: AccountAgent): string {
	return `${hostUrl}|${agent}`;
}

/** Hosts whose away summary already ran in this renderer. */
const summarisedHosts = new Set<string>();

/**
 * Timestamps of the switches told live per host, collected only while that
 * host's away summary is still loading. The summary reads its watermark
 * before the round trip, so a switch that lands during it would otherwise be
 * notified *and* counted again as one the user missed.
 */
const liveSwitchesDuringSummary = new Map<string, Set<number>>();

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
			rememberLastSeenAt(hostUrl, payload.at);
			liveSwitchesDuringSummary.get(hostUrl)?.add(payload.at);
			// Switching works again for this agent, whoever made it happen, so
			// the next failure is news. The only positive recovery signal there
			// is: the engine never announces that a failure stopped.
			lastFailureCodes.delete(latchKey(hostUrl, payload.agent));

			if (!markSwitchSeen(`${hostUrl}:${payload.agent}:${payload.at}`)) return;
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
			notifyExhaustion(payload, hostUrl);
			notifyNeedsAttention(payload, hostUrl, workspaces);
			notifySwitchFailure(payload, hostUrl);
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
		// Both strategies emit this reason, so the sentence names the reason,
		// not the strategy — worded as the switch-history table words it.
		case "strategy":
			return i18n._(msg({ message: "More headroom elsewhere" }));
		case "fallback":
			return payload.fallbackRestart
				? i18n._(msg({ message: "Fallback restart after a usage limit" }))
				: i18n._(msg({ message: "Usage limit reached" }));
		case "external":
			return i18n._(msg({ message: "Login changed outside Superset" }));
		default:
			return "";
	}
}

function getAgentLabel(agent: AccountAgent): string {
	return AGENT_IDENTITY_LABELS[agent] ?? agent;
}

/** R22: told once per episode, and again only after the engine recovers. */
function notifyExhaustion(
	payload: AccountEngineStatePayload,
	hostUrl: string,
): void {
	const key = latchKey(hostUrl, payload.agent);
	// With auto-switch off nothing polls this agent and nothing will switch, so
	// the latched flag is stale and "switching resumes" would be a promise the
	// engine cannot keep.
	if (!payload.enabled) {
		exhaustedAgents.delete(key);
		return;
	}
	if (!payload.exhausted) {
		exhaustedAgents.delete(key);
		return;
	}
	if (exhaustedAgents.has(key)) return;
	exhaustedAgents.add(key);

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
	hostUrl: string,
	workspaces: HostNotificationWorkspaceState[],
): void {
	const latch = latchKey(hostUrl, payload.agent);
	const target = payload.needsAttention;
	if (!target) {
		needsAttentionKeys.delete(latch);
		return;
	}
	const key = `${target.workspaceId}:${target.terminalId}:${target.reason}`;
	if (needsAttentionKeys.get(latch) === key) return;
	needsAttentionKeys.set(latch, key);

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

/**
 * R24: an automatic switch the engine could not make. The previous login is
 * still in place, so the user has to know a limit is no longer being routed
 * around. Told once per run of the same code per host and agent: the engine
 * retries every poll and fails the same way every time, so re-notifying on the
 * new timestamp would be a notification a minute with no way to stop it. A
 * different code, or a switch that finally lands, makes the next one news
 * again, and one host's failure never silences another host's.
 */
function notifySwitchFailure(
	payload: AccountEngineStatePayload,
	hostUrl: string,
): void {
	const failure = payload.lastSwitchFailure;
	// Deliberately no `delete` here: absence is not recovery, it is a
	// broadcast that carried no failure field.
	if (!failure) return;
	const latch = latchKey(hostUrl, payload.agent);
	if (lastFailureCodes.get(latch) === failure.code) return;
	const key = `failure:${hostUrl}:${payload.agent}:${failure.code}:${failure.at}`;
	if (!markSwitchSeen(key)) return;
	lastFailureCodes.set(latch, failure.code);

	const agent = getAgentLabel(payload.agent);
	showNative({
		title: i18n._(msg({ message: `${agent} could not switch accounts` })),
		body: switchFailureMessage(failure.code),
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
 * Runs once per host per renderer, against that host's own marker, so every
 * host summarises what it alone missed.
 */
async function showAwaySummary(
	hostUrl: string,
	loadHistory: LoadSwitchHistory,
): Promise<void> {
	if (summarisedHosts.has(hostUrl)) return;
	summarisedHosts.add(hostUrl);

	const lastSeenAt = readLastSeenAt(hostUrl);
	const toldLive = new Set<number>();
	liveSwitchesDuringSummary.set(hostUrl, toldLive);
	try {
		const { entries } = await loadHistory(hostUrl);

		rememberLastSeenAt(hostUrl, ...entries.map((entry) => entry.at));
		// `fallback-rejected` rows are refused hints, not switches. A switch
		// that arrived live during the load is already on screen as its own
		// notification, so the summary leaves it out rather than telling the
		// user about it twice.
		const count = entries.filter(
			(entry) =>
				entry.at > lastSeenAt &&
				entry.reasonKind !== "fallback-rejected" &&
				!toldLive.has(entry.at),
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
	} finally {
		liveSwitchesDuringSummary.delete(hostUrl);
	}
}

/**
 * Anything that is not the current map — absent, blocked, or the pre-per-host
 * scalar this key used to hold — reads as "no watermark yet", which costs at
 * most one extra summary and is overwritten on the next write.
 */
function readWatermarks(): Record<string, number> {
	try {
		const raw = localStorage.getItem(LAST_SEEN_AT_KEY);
		if (raw === null) return {};
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
			return {};
		const watermarks: Record<string, number> = {};
		for (const [host, at] of Object.entries(parsed)) {
			if (typeof at === "number" && Number.isFinite(at)) watermarks[host] = at;
		}
		return watermarks;
	} catch {
		return {};
	}
}

function readLastSeenAt(hostUrl: string): number {
	return readWatermarks()[hostUrl] ?? 0;
}

function rememberLastSeenAt(hostUrl: string, ...timestamps: number[]): void {
	const newest = Math.max(0, ...timestamps);
	const watermarks = readWatermarks();
	if (newest <= (watermarks[hostUrl] ?? 0)) return;
	watermarks[hostUrl] = newest;
	try {
		localStorage.setItem(
			LAST_SEEN_AT_KEY,
			JSON.stringify(cap(watermarks, hostUrl)),
		);
	} catch {
		// A blocked or full localStorage only costs a repeated summary.
	}
}

/** Keeps the newest few hosts: the key must not grow with every host this
 * renderer has ever connected to. `written` is the host this write is for and
 * always survives — it is the oldest entry exactly when its own switches are
 * the least recent, and evicting it means its watermark is never stored at all
 * and it summarises the same old switches on every launch. */
function cap(
	watermarks: Record<string, number>,
	written: string,
): Record<string, number> {
	const entries = Object.entries(watermarks);
	if (entries.length <= MAX_WATERMARK_HOSTS) return watermarks;
	const kept = entries
		.filter(([host]) => host !== written)
		.sort(([, a], [, b]) => b - a)
		.slice(0, MAX_WATERMARK_HOSTS - 1);
	kept.push([written, watermarks[written]]);
	return Object.fromEntries(kept);
}
