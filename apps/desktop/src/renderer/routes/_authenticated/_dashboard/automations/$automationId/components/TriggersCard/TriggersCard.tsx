import { formatDateTime } from "@superset/i18n/format";
import type { DraftTrigger } from "@superset/shared/automation-triggers";
import { nextOccurrenceAfter } from "@superset/shared/rrule";
import type { RouterOutputs } from "@superset/trpc";
import { useRecentProjects } from "renderer/hooks/host-projects/useRecentProjects";
import type { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { DevicePicker } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker";
import { ProjectPicker } from "../../../components/ProjectPicker";
import { RelayOfflineNotice } from "../../../components/RelayOfflineNotice";
import { TriggersEditor } from "../../../components/TriggersEditor";
import { WorkspacePicker } from "../../../components/WorkspacePicker";
import { AutomationTagsPicker } from "./components/AutomationTagsPicker";

export type AutomationUpdatePatch = Partial<
	Omit<Parameters<typeof apiTrpcClient.automation.update.mutate>[0], "id">
>;

type AutomationDetail = RouterOutputs["automation"]["get"];

interface TriggersCardProps {
	automation: AutomationDetail;
	hostId: string | null;
	readOnly?: boolean;
	onUpdate: (patch: AutomationUpdatePatch) => void;
	/** Resolves once the write lands, so the editor knows the set is saved. */
	onSaveTriggers: (triggers: DraftTrigger[]) => Promise<unknown>;
}

/**
 * Sentence-shaped trigger: "[Daily at 8:00 AM] [America/LA]" with an
 * indented scope line "in [project] on [device] · [workspace]".
 */
export function TriggersCard({
	automation,
	hostId,
	readOnly,
	onUpdate,
	onSaveTriggers,
}: TriggersCardProps) {
	const recentProjects = useRecentProjects();
	const selectedProject = recentProjects.find(
		(p) => p.id === automation.v2ProjectId,
	);

	// The scope line is the same grammar as a trigger sentence — "in X on Y using
	// Z" — so it uses the same chips. Left alone, the three pickers render at
	// 36px/12px, 22px/11px and 36px/12px, none of which match the 24px/13px chips
	// directly above them. Passed per call site, so the pickers keep their own
	// look everywhere else they are used.
	const SCOPE_CHIP =
		"h-6 gap-1 rounded-[6px] bg-foreground/[0.06] px-2 text-[13px] font-normal hover:bg-foreground/10";

	// Computed from the rule on screen, never the dispatcher's persisted
	// nextRunAt: that value lags behind edits, goes stale while paused, and
	// doesn't exist for a row that hasn't been saved yet.
	const renderNextRun = (
		config: Extract<DraftTrigger["config"], { kind: "schedule" }>,
	) => {
		try {
			const next = nextOccurrenceAfter({
				rrule: config.rrule,
				dtstart: new Date(config.dtstart),
				timezone: config.timezone,
				after: new Date(),
			});
			if (!next) return null;
			return (
				<span>
					{"Next run "}
					{formatDateTime(next, {
						weekday: "short",
						month: "short",
						day: "numeric",
						hour: "numeric",
						minute: "2-digit",
						timeZoneName: "short",
						timeZone: config.timezone,
					})}
				</span>
			);
		} catch {
			return null;
		}
	};

	return (
		<div className="flex flex-col gap-1">
			<TriggersEditor
				triggers={automation.triggers.map((t) => ({
					id: t.id,
					config: t.config as DraftTrigger["config"],
				}))}
				onChange={onSaveTriggers}
				organizationId={automation.organizationId}
				renderNextRun={renderNextRun}
				readOnly={readOnly}
			>
				<div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-2 pt-1 text-[13px] text-muted-foreground">
					<span>in</span>
					<ProjectPicker
						className={SCOPE_CHIP}
						selectedProject={selectedProject}
						sessionSelected={automation.v2ProjectId === null}
						recentProjects={recentProjects}
						disabled={readOnly}
						onSelectProject={(v2ProjectId) => onUpdate({ v2ProjectId })}
					/>
					<span>on</span>
					<DevicePicker
						className={SCOPE_CHIP}
						hostId={hostId}
						showLocalOnlineState
						disabled={readOnly}
						onSelectHostId={(nextHostId) =>
							onUpdate({ targetHostId: nextHostId })
						}
					/>
					<span>using</span>
					<WorkspacePicker
						className={SCOPE_CHIP}
						hostId={hostId}
						projectId={automation.v2ProjectId}
						value={automation.v2WorkspaceId}
						disabled={readOnly}
						onChange={(v2WorkspaceId) =>
							onUpdate({
								v2WorkspaceId,
								// Denormalized pin: the picker is scoped to this host/project,
								// so send both — the cloud stores them without a
								// workspace-registry lookup. A null project means the pin is a
								// session workspace.
								...(v2WorkspaceId && hostId
									? {
											targetHostId: hostId,
											v2ProjectId: automation.v2ProjectId,
										}
									: {}),
							})
						}
					/>
					<span>tagged</span>
					<AutomationTagsPicker
						className={SCOPE_CHIP}
						tags={automation.tags}
						projectId={automation.v2ProjectId}
						disabled={readOnly}
						onChange={(tags) => onUpdate({ tags })}
					/>
				</div>
			</TriggersEditor>
			<RelayOfflineNotice hostId={hostId} className="mt-1" />
		</div>
	);
}
