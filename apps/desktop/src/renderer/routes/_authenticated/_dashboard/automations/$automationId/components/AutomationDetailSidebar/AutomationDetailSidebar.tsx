import type {
	SelectAutomation,
	SelectAutomationRun,
} from "@superset/db/schema";
import { formatDateTimeInTimezone } from "@superset/shared/rrule";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { useEnabledAgents } from "renderer/hooks/useEnabledAgents";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { DevicePicker } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions/useWorkspaceHostOptions";
import { AgentPicker } from "../../../components/AgentPicker";
import { ProjectPicker } from "../../../components/ProjectPicker";
import { SchedulePicker } from "../../../components/SchedulePicker";
import { TimezonePicker } from "../../../components/TimezonePicker";
import { WorkspacePicker } from "../../../components/WorkspacePicker";
import { useRecentProjects } from "../../../hooks/useRecentProjects";
import { PreviousRunsList } from "../PreviousRunsList";
import { Row } from "./components/Row";
import { Section } from "./components/Section";
import { SectionTitle } from "./components/SectionTitle";

interface AutomationDetailSidebarProps {
	automation: SelectAutomation;
	recentRuns: SelectAutomationRun[];
}

export function AutomationDetailSidebar({
	automation,
	recentRuns,
}: AutomationDetailSidebarProps) {
	const { agents: enabledAgents } = useEnabledAgents();
	const recentProjects = useRecentProjects();
	const { localHostId } = useWorkspaceHostOptions();
	const selectedProject = recentProjects.find(
		(p) => p.id === automation.v2ProjectId,
	);

	const hostId = automation.targetHostId ?? localHostId ?? null;

	const updateMutation = useMutation({
		mutationFn: (
			patch: Partial<
				Parameters<typeof apiTrpcClient.automation.update.mutate>[0]
			>,
		) =>
			apiTrpcClient.automation.update.mutate({ id: automation.id, ...patch }),
	});

	const lastRunAt = recentRuns
		.map((run) => run.scheduledFor)
		.map((d) => (d ? new Date(d) : null))
		.filter((d): d is Date => d !== null)
		.sort((a, b) => b.getTime() - a.getTime())[0];

	return (
		<aside className="flex w-[368px] shrink-0 flex-col border-l overflow-hidden">
			<div className="flex flex-col gap-8 p-6 pb-2 shrink-0">
				<Section title="Status">
					<Row
						label="Status"
						value={
							<span className="inline-flex items-center gap-2">
								<span
									className={cn(
										"inline-block size-2 shrink-0 rounded-full",
										automation.enabled
											? "bg-emerald-500"
											: "border border-muted-foreground/60",
									)}
								/>
								{automation.enabled ? "Active" : "Paused"}
							</span>
						}
					/>
					<Row
						label="Next run"
						value={
							automation.enabled && automation.nextRunAt
								? formatDateTimeInTimezone(
										new Date(automation.nextRunAt),
										automation.timezone,
									)
								: "—"
						}
					/>
					<Row
						label="Last ran"
						value={
							lastRunAt
								? formatDateTimeInTimezone(lastRunAt, automation.timezone)
								: "—"
						}
					/>
				</Section>

				<Section title="Details">
					<Row
						label="Device"
						value={
							<DevicePicker
								className="-mr-4"
								hostId={hostId}
								onSelectHostId={(nextHostId) => {
									updateMutation.mutate({ targetHostId: nextHostId });
								}}
							/>
						}
					/>
					<Row
						label="Project"
						value={
							<ProjectPicker
								className="-mr-4"
								selectedProject={selectedProject}
								recentProjects={recentProjects}
								onSelectProject={(v2ProjectId) =>
									updateMutation.mutate({ v2ProjectId })
								}
							/>
						}
					/>
					<Row
						label="Workspace"
						value={
							<WorkspacePicker
								className="-mr-4"
								hostId={automation.targetHostId ?? null}
								projectId={automation.v2ProjectId}
								value={automation.v2WorkspaceId}
								onChange={(v2WorkspaceId) =>
									updateMutation.mutate({ v2WorkspaceId })
								}
							/>
						}
					/>
					<Row
						label="Repeats"
						value={
							<SchedulePicker
								className="-mr-4"
								rrule={automation.rrule}
								onRruleChange={(rrule) => updateMutation.mutate({ rrule })}
							/>
						}
					/>
					<Row
						label="Agent"
						value={
							<AgentPicker
								className="-mr-4"
								value={automation.agentConfig.id}
								onChange={(id) => {
									const config = enabledAgents.find((a) => a.id === id);
									if (config) updateMutation.mutate({ agentConfig: config });
								}}
							/>
						}
					/>
					<Row
						label="Timezone"
						value={
							<TimezonePicker
								className="-mr-4"
								value={automation.timezone}
								onChange={(timezone) => updateMutation.mutate({ timezone })}
							/>
						}
					/>
				</Section>
			</div>

			<div className="mt-8 flex min-h-0 flex-1 flex-col gap-2 pl-6 pr-3 pb-6">
				<SectionTitle>Previous runs</SectionTitle>
				<div className="min-h-0 flex-1 overflow-y-auto">
					<PreviousRunsList runs={recentRuns} />
				</div>
			</div>
		</aside>
	);
}
