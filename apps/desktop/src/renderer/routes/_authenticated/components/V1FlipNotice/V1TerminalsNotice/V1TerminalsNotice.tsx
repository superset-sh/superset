import { msg, plural } from "@lingui/core/macro";
import { useLingui as useTranslation } from "@lingui/react";
import { formatList } from "@superset/i18n/format";
import {
	BUILTIN_AGENT_IDS,
	BUILTIN_AGENT_LABELS,
} from "@superset/shared/agent-catalog";
import { useEffect, useRef, useState } from "react";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { attentionSignature } from "renderer/lib/v1-migration/attention";
import {
	isV1AttentionDismissed,
	isV1MigrationComplete,
	isV1WelcomePending,
} from "renderer/lib/v1-migration/completion";
import { electronV1MigrationIpc } from "renderer/lib/v1-migration/ipc";
import {
	resolveMigratedPaneResume,
	type V1PaneAgentSessionSnapshot,
} from "renderer/lib/v1-migration/terminals";
import { useV1MigrationStatusStore } from "renderer/stores/v1-migration-status";
import { FlipNoticeCard } from "../components/FlipNoticeCard";

const NOTICE_PREFIX = "v1-terminals-notice-";

const RESUME_COMMANDS = ["claude --resume", "codex resume"];

type NoticeState = "pending" | "dismissed";

export interface V1TerminalsNoticeSource {
	listMigratedPaneIds(organizationId: string): Promise<string[]>;
	readAgentSessions(
		paneIds: string[],
	): Promise<Record<string, V1PaneAgentSessionSnapshot>>;
	listLiveV1PaneIds(): Promise<string[]>;
	stopV1Sessions(paneIds: string[]): Promise<{ failedPaneIds: string[] }>;
}

const electronSource: V1TerminalsNoticeSource = {
	listMigratedPaneIds: async (organizationId) => {
		const rows = await electronV1MigrationIpc.ledgerList(organizationId);
		return rows
			.filter((row) => row.kind === "terminal" && row.status === "success")
			.map((row) => row.v1Id);
	},
	readAgentSessions: (paneIds) =>
		electronTrpcClient.migration.readV1PaneAgentSessions.query({ paneIds }),
	listLiveV1PaneIds: async () => {
		const sessions =
			await electronTrpcClient.migration.listLiveV1Sessions.query();
		return sessions.map((session) => session.paneId);
	},
	stopV1Sessions: (paneIds) =>
		electronTrpcClient.migration.stopV1Sessions.mutate({ paneIds }),
};

interface BootSnapshot {
	migrationCompleteAtBoot: boolean;
	welcomePendingAtBoot: boolean;
}

// Read once per org per launch: the pass marks completion and arms the
// welcome card mid-session, and both must not move this card's rule.
const bootSnapshots = new Map<string, BootSnapshot>();

function readBootSnapshot(organizationId: string): BootSnapshot {
	let snapshot = bootSnapshots.get(organizationId);
	if (!snapshot) {
		snapshot = {
			migrationCompleteAtBoot: isV1MigrationComplete(organizationId),
			welcomePendingAtBoot: isV1WelcomePending(organizationId),
		};
		bootSnapshots.set(organizationId, snapshot);
	}
	return snapshot;
}

function readNoticeState(organizationId: string): NoticeState | null {
	try {
		const value = localStorage.getItem(NOTICE_PREFIX + organizationId);
		return value === "pending" || value === "dismissed" ? value : null;
	} catch {
		return null;
	}
}

function writeNoticeState(organizationId: string, state: NoticeState): void {
	try {
		localStorage.setItem(NOTICE_PREFIX + organizationId, state);
	} catch {}
}

function listResumedAgentLabels(
	sessions: Record<string, V1PaneAgentSessionSnapshot>,
): string[] {
	const labels = new Set<string>();
	for (const session of Object.values(sessions)) {
		const resume = resolveMigratedPaneResume(session);
		const agentId = BUILTIN_AGENT_IDS.find((id) => id === resume?.agentId);
		if (agentId) labels.add(BUILTIN_AGENT_LABELS[agentId]);
	}
	return [...labels].sort();
}

interface Notice {
	organizationId: string;
	resumedAgentLabels: string[];
	liveV1PaneIds: string[];
}

export function V1TerminalsNotice({
	source = electronSource,
}: {
	source?: V1TerminalsNoticeSource;
}) {
	const { _: translate } = useTranslation();
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const {
		organizationId: statusOrganizationId,
		status,
		attentionItems,
	} = useV1MigrationStatusStore();
	const [notice, setNotice] = useState<Notice | null>(null);
	const trackedRef = useRef<string | null>(null);
	const [stopState, setStopState] = useState<"idle" | "stopping" | "failed">(
		"idle",
	);

	const boot = organizationId ? readBootSnapshot(organizationId) : null;
	const statusForOrg = statusOrganizationId === organizationId ? status : null;
	const waitsForPass =
		!!boot &&
		!boot.migrationCompleteAtBoot &&
		(statusForOrg === null || statusForOrg === "running");

	useEffect(() => {
		if (!organizationId || waitsForPass) return;
		const stored = readNoticeState(organizationId);
		if (stored === "dismissed") return;
		const snapshot = readBootSnapshot(organizationId);
		const cameFromV1 =
			stored === "pending" ||
			!snapshot.migrationCompleteAtBoot ||
			snapshot.welcomePendingAtBoot;
		if (!cameFromV1) return;

		let cancelled = false;
		void (async () => {
			try {
				const paneIds = await source.listMigratedPaneIds(organizationId);
				if (cancelled || paneIds.length === 0) return;
				writeNoticeState(organizationId, "pending");
				const [sessions, liveV1PaneIds] = await Promise.all([
					source.readAgentSessions(paneIds).catch(() => ({})),
					source.listLiveV1PaneIds().catch(() => []),
				]);
				if (cancelled) return;
				setNotice({
					organizationId,
					resumedAgentLabels: listResumedAgentLabels(sessions),
					liveV1PaneIds,
				});
			} catch (err) {
				console.warn("[v1-terminals-notice] ledger read failed", err);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [organizationId, waitsForPass, source]);

	const statusCardShowing =
		!!organizationId &&
		statusForOrg !== null &&
		statusForOrg !== "idle" &&
		!(
			statusForOrg === "attention" &&
			isV1AttentionDismissed(organizationId, attentionSignature(attentionItems))
		);
	const visible =
		!!notice &&
		notice.organizationId === organizationId &&
		!statusCardShowing &&
		!boot?.welcomePendingAtBoot;

	useEffect(() => {
		if (!visible || !notice || trackedRef.current === notice.organizationId) {
			return;
		}
		trackedRef.current = notice.organizationId;
		track("v1_terminals_notice_shown", {
			resumed_agent_count: notice.resumedAgentLabels.length,
			live_v1_session_count: notice.liveV1PaneIds.length,
		});
	}, [visible, notice]);

	if (!visible || !notice) return null;

	const dismiss = () => {
		track("v1_terminals_notice_dismissed", {
			live_v1_session_count: notice.liveV1PaneIds.length,
		});
		// While v1 sessions live, their agents can't resume; ask again next launch.
		if (notice.liveV1PaneIds.length === 0) {
			writeNoticeState(notice.organizationId, "dismissed");
		}
		setNotice(null);
	};

	const agents = formatList(notice.resumedAgentLabels);

	if (notice.liveV1PaneIds.length > 0) {
		const liveCount = notice.liveV1PaneIds.length;
		const stop = async () => {
			if (stopState === "stopping") return;
			setStopState("stopping");
			track("v1_terminals_notice_stop_clicked", {
				live_v1_session_count: liveCount,
			});
			try {
				const { failedPaneIds } = await source.stopV1Sessions(
					notice.liveV1PaneIds,
				);
				setNotice((current) =>
					current ? { ...current, liveV1PaneIds: failedPaneIds } : current,
				);
				setStopState(failedPaneIds.length > 0 ? "failed" : "idle");
			} catch (err) {
				console.warn("[v1-terminals-notice] stop failed", err);
				setStopState("failed");
			}
		};
		const liveBody = [
			translate(
				msg({
					message: plural(liveCount, {
						one: "# terminal from v1 is still running in the background. The new Superset can't show it, and an agent in it can still change your files.",
						other:
							"# terminals from v1 are still running in the background. The new Superset can't show them, and agents in them can still change your files.",
					}),
				}),
			),
			notice.resumedAgentLabels.length > 0
				? translate(
						msg({
							message: `After you stop them, Superset resumes the agent sessions it recorded (${agents}) when you open their workspace.`,
						}),
					)
				: null,
			translate(msg({ message: "They stop when you restart your computer." })),
		]
			.filter(Boolean)
			.join(" ");

		return (
			<FlipNoticeCard
				title={translate(
					msg({ message: "Terminals from v1 are still running" }),
				)}
				body={liveBody}
				warning={
					stopState === "failed"
						? translate(
								msg({ message: "Some terminals did not stop. Try again." }),
							)
						: undefined
				}
				ctaLabel={
					stopState === "stopping"
						? translate(msg({ message: "Stopping…" }))
						: translate(msg({ message: "Stop them" }))
				}
				onCta={() => void stop()}
				onDismiss={dismiss}
			/>
		);
	}

	const body = [
		translate(
			msg({
				message:
					"Running terminals from v1 did not carry over. Each v1 workspace now has new terminals that open in the same folders.",
			}),
		),
		notice.resumedAgentLabels.length > 0
			? translate(
					msg({
						message: `Superset resumes the agent sessions it recorded (${agents}) when you open their workspace.`,
					}),
				)
			: null,
	]
		.filter(Boolean)
		.join(" ");

	return (
		<FlipNoticeCard
			title={translate(msg({ message: "Your terminals restarted" }))}
			body={body}
			ctaLabel={translate(msg({ message: "Got it" }))}
			onDismiss={dismiss}
		>
			<div className="space-y-1.5">
				<p className="text-muted-foreground text-sm">
					{notice.resumedAgentLabels.length > 0
						? translate(
								msg({
									message:
										"To get back a different agent conversation, run this in a terminal in its folder:",
								}),
							)
						: translate(
								msg({
									message:
										"To get back an agent conversation, run this in a terminal in its folder:",
								}),
							)}
				</p>
				<ul className="space-y-1">
					{RESUME_COMMANDS.map((command) => (
						<li key={command}>
							<code className="bg-muted px-1.5 py-0.5 font-mono text-xs">
								{command}
							</code>
						</li>
					))}
				</ul>
			</div>
		</FlipNoticeCard>
	);
}
