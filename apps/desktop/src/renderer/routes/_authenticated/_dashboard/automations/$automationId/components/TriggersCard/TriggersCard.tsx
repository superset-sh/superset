import type { DraftTrigger } from "@superset/shared/automation-triggers";
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
import { useProviderOptions } from "../../../components/providers/useProviderOptions";
import { RelayOfflineNotice } from "../../../components/RelayOfflineNotice";
import { TriggersEditor } from "../../../components/TriggersEditor";
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
	const options = useProviderOptions(automation.organizationId);
	const selectedProject = recentProjects.find(
		(p) => p.id === automation.v2ProjectId,
	);

	// Per trigger, not per automation: an automation can hold several schedules,
	// and the automation-level nextRunAt is only the soonest of them — showing it
	// on every row claims they all fire at the same time.
	const nextRunByTriggerId = useMemo(() => {
		// The zone travels with the date: schedules on one automation can sit in
		// different timezones, so formatting them all in the automation-level one
		// would label the tooltip wrongly for every schedule but the soonest.
		const entries = new Map<
			string,
			{ at: Date; timezone: string; exhausted: boolean }
		>();

		for (const trigger of automation.triggers) {
			const config = trigger.config as DraftTrigger["config"];
			if (config.kind !== "schedule") continue;

			// The evaluator disables a schedule once its last occurrence fires
			// (COUNT/UNTIL) and leaves nextRunAt at that final time — so a
			// disabled trigger's nextRunAt is when it last ran, not when it will.
			if (automation.enabled && trigger.nextRunAt) {
				entries.set(trigger.id, {
					at: new Date(trigger.nextRunAt),
					timezone: config.timezone,
					exhausted: !trigger.enabled,
				});
				continue;
			}
			// A paused automation keeps a stale nextRunAt, so compute what this
			// schedule would fire next — the row is previewable before resuming.
			try {
				const next = nextOccurrenceAfter({
					rrule: config.rrule,
					dtstart: new Date(config.dtstart),
					timezone: config.timezone,
					after: new Date(),
				});
				if (next)
					entries.set(trigger.id, {
						at: next,
						timezone: config.timezone,
						exhausted: false,
					});
			} catch (error) {
				console.warn(
					`[TriggersCard] failed to compute next occurrence for trigger ${trigger.id}`,
					error,
				);
			}
		}

		return entries;
	}, [automation.triggers, automation.enabled]);

	// The scope line is the same grammar as a trigger sentence — "in X on Y using
	// Z" — so it uses the same chips. Left alone, the three pickers render at
	// 36px/12px, 22px/11px and 36px/12px, none of which match the 24px/13px chips
	// directly above them. Passed per call site, so the pickers keep their own
	// look everywhere else they are used.
	const SCOPE_CHIP =
		"h-6 gap-1 rounded-[6px] bg-foreground/[0.06] px-2 text-[13px] font-normal hover:bg-foreground/10";

	const renderNextRun = (triggerId?: string) => {
		const run = triggerId ? nextRunByTriggerId.get(triggerId) : undefined;
		if (!run) return null;
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span>
						{run.exhausted
							? "Ran "
							: automation.enabled
								? "Next run "
								: "Would run "}
						{formatDistanceStrict(run.at, new Date(), { addSuffix: true })}
					</span>
				</TooltipTrigger>
				<TooltipContent side="right">
					{formatDateTimeInTimezone(run.at, run.timezone)}
				</TooltipContent>
			</Tooltip>
		);
	};

	return (
		<div className="flex flex-col gap-1">
			<TriggersEditor
				triggers={automation.triggers.map((t) => ({
					id: t.id,
					enabled: t.enabled,
					config: t.config as DraftTrigger["config"],
				}))}
				onChange={onSaveTriggers}
				options={options}
				renderNextRun={renderNextRun}
				readOnly={readOnly}
			/>
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
			</div>
			<RelayOfflineNotice hostId={hostId} className="mt-1" />
		</div>
	);
}
