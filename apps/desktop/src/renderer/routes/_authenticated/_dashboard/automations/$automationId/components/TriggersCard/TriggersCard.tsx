import { formatDateTime } from "@superset/i18n/format";
import type {
	DraftTrigger,
	TriggerProblem,
} from "@superset/shared/automation-triggers";
import { nextOccurrenceAfter } from "@superset/shared/rrule";
import type { RouterOutputs } from "@superset/trpc";
import { useRecentProjects } from "renderer/hooks/host-projects/useRecentProjects";
import type { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { DevicePicker } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker";
import { ProjectPicker } from "../../../components/ProjectPicker";
import type {
	OptionGroupState,
	ProviderOptions,
} from "../../../components/providers/types";
import { RelayOfflineNotice } from "../../../components/RelayOfflineNotice";
import { TriggersEditor } from "../../../components/TriggersEditor";
import { WorkspacePicker } from "../../../components/WorkspacePicker";
import { AutomationTagsPicker } from "./components/AutomationTagsPicker";

export type AutomationUpdatePatch = Partial<
	Omit<Parameters<typeof apiTrpcClient.automation.update.mutate>[0], "id">
>;

type AutomationDetail = RouterOutputs["automation"]["get"];

export interface ScopeDraft {
	v2ProjectId: string | null;
	targetHostId: string | null;
	v2WorkspaceId: string | null;
	tags: string[];
}

interface TriggersCardProps {
	automation: AutomationDetail;
	hostId: string | null;
	readOnly?: boolean;
	scope: ScopeDraft;
	onScopeChange: (patch: Partial<ScopeDraft>) => void;
	drafts: DraftTrigger[];
	onEditTriggers: (next: DraftTrigger[]) => void;
	problems: TriggerProblem[];
	options: ProviderOptions;
	optionState: Record<string, OptionGroupState>;
}

export function TriggersCard({
	automation,
	hostId,
	readOnly,
	scope,
	onScopeChange,
	drafts,
	onEditTriggers,
	problems,
	options,
	optionState,
}: TriggersCardProps) {
	const recentProjects = useRecentProjects();
	const selectedProject = recentProjects.find(
		(p) => p.id === scope.v2ProjectId,
	);

	// Sized to match the sentence chips above, which the pickers don't match by default.
	const SCOPE_CHIP =
		"h-6 gap-1 rounded-[6px] bg-foreground/[0.06] px-2 text-[13px] font-normal hover:bg-foreground/10";

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
				drafts={drafts}
				onEdit={onEditTriggers}
				problems={problems}
				options={options}
				optionState={optionState}
				organizationId={automation.organizationId}
				renderNextRun={renderNextRun}
				readOnly={readOnly}
			>
				<div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-2 pt-1 text-[13px] text-muted-foreground">
					<span>in</span>
					<ProjectPicker
						className={SCOPE_CHIP}
						selectedProject={selectedProject}
						sessionSelected={scope.v2ProjectId === null}
						recentProjects={recentProjects}
						disabled={readOnly}
						onSelectProject={(v2ProjectId) =>
							onScopeChange(
								v2ProjectId === scope.v2ProjectId
									? { v2ProjectId }
									: { v2ProjectId, v2WorkspaceId: null },
							)
						}
					/>
					<span>on</span>
					<DevicePicker
						className={SCOPE_CHIP}
						hostId={hostId}
						showLocalOnlineState
						disabled={readOnly}
						onSelectHostId={(nextHostId) =>
							onScopeChange(
								nextHostId === scope.targetHostId
									? { targetHostId: nextHostId }
									: { targetHostId: nextHostId, v2WorkspaceId: null },
							)
						}
					/>
					<span>using</span>
					<WorkspacePicker
						className={SCOPE_CHIP}
						hostId={hostId}
						projectId={scope.v2ProjectId}
						value={scope.v2WorkspaceId}
						disabled={readOnly}
						onChange={(v2WorkspaceId) =>
							onScopeChange({
								v2WorkspaceId,
								// Denormalized pin: the cloud stores both without a registry lookup.
								...(v2WorkspaceId && hostId
									? {
											targetHostId: hostId,
											v2ProjectId: scope.v2ProjectId,
										}
									: {}),
							})
						}
					/>
					<span>tagged</span>
					<AutomationTagsPicker
						className={SCOPE_CHIP}
						tags={scope.tags}
						projectId={scope.v2ProjectId}
						disabled={readOnly}
						onChange={(tags) => onScopeChange({ tags })}
					/>
				</div>
			</TriggersEditor>
			<RelayOfflineNotice hostId={hostId} className="mt-1" />
		</div>
	);
}
