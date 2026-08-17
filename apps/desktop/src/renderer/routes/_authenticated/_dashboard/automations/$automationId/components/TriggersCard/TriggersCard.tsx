import {
	formatDateTimeInTimezone,
	nextOccurrenceAfter,
} from "@superset/shared/rrule";
import type { RouterOutputs } from "@superset/trpc";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { formatDistanceStrict } from "date-fns";
import { useMemo } from "react";
import { useRecentProjects } from "renderer/hooks/host-projects/useRecentProjects";
import type { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { DevicePicker } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker";
import { ProjectPicker } from "../../../components/ProjectPicker";
import { RelayOfflineNotice } from "../../../components/RelayOfflineNotice";
import { ScheduleSentence } from "../../../components/ScheduleSentence";
import { WorkspacePicker } from "../../../components/WorkspacePicker";

export type AutomationUpdatePatch = Partial<
	Omit<Parameters<typeof apiTrpcClient.automation.update.mutate>[0], "id">
>;

type AutomationDetail = RouterOutputs["automation"]["get"];

interface TriggersCardProps {
	automation: AutomationDetail;
	hostId: string | null;
	readOnly?: boolean;
	onUpdate: (patch: AutomationUpdatePatch) => void;
}

/**
 * Cursor-style sentence trigger: "[Daily at 8:00 AM] [America/LA]" with an
 * indented scope line "in [project] on [device] · [workspace]".
 */
export function TriggersCard({
	automation,
	hostId,
	readOnly,
	onUpdate,
}: TriggersCardProps) {
	const recentProjects = useRecentProjects();
	const selectedProject = recentProjects.find(
		(p) => p.id === automation.v2ProjectId,
	);

	// Paused automations keep a stale nextRunAt; compute what the schedule
	// would fire next so edits are previewable before resuming.
	const nextRunDate = useMemo(() => {
		if (automation.enabled) {
			return automation.nextRunAt ? new Date(automation.nextRunAt) : null;
		}
		try {
			return nextOccurrenceAfter({
				rrule: automation.rrule,
				dtstart: new Date(automation.dtstart),
				timezone: automation.timezone,
				after: new Date(),
			});
		} catch (error) {
			console.warn(
				`[TriggersCard] failed to compute next occurrence for automation ${automation.id}`,
				error,
			);
			return null;
		}
	}, [
		automation.enabled,
		automation.nextRunAt,
		automation.rrule,
		automation.dtstart,
		automation.timezone,
		automation.id,
	]);

	return (
		<div className="flex flex-col rounded-xl border border-border bg-card/40 px-4 py-3">
			<ScheduleSentence
				rrule={automation.rrule}
				onRruleChange={(rrule) => onUpdate({ rrule })}
				timezone={automation.timezone}
				onTimezoneChange={(timezone) => onUpdate({ timezone })}
				disabled={readOnly}
			/>
			<div className="ml-2 flex flex-wrap items-center gap-x-1 gap-y-1 border-l border-border pl-4 pt-1 text-sm text-muted-foreground">
				<span>in</span>
				<ProjectPicker
					selectedProject={selectedProject}
					sessionSelected={automation.v2ProjectId === null}
					recentProjects={recentProjects}
					disabled={readOnly}
					onSelectProject={(v2ProjectId) => onUpdate({ v2ProjectId })}
				/>
				<span>on</span>
				<DevicePicker
					hostId={hostId}
					showLocalOnlineState
					disabled={readOnly}
					onSelectHostId={(nextHostId) =>
						onUpdate({ targetHostId: nextHostId })
					}
				/>
				<span>using</span>
				<WorkspacePicker
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
			</div>
			{nextRunDate && (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="mt-3 w-fit text-xs text-muted-foreground">
							{automation.enabled ? "Next run " : "Would run "}
							{formatDistanceStrict(nextRunDate, new Date(), {
								addSuffix: true,
							})}
						</span>
					</TooltipTrigger>
					<TooltipContent side="right">
						{formatDateTimeInTimezone(nextRunDate, automation.timezone)}
					</TooltipContent>
				</Tooltip>
			)}
			<RelayOfflineNotice hostId={hostId} className="mt-2" />
		</div>
	);
}
