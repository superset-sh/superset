import type {
	SelectAutomation,
	SelectAutomationRun,
} from "@superset/db/schema";
import { formatDateTimeInTimezone } from "@superset/shared/rrule";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { DevicePicker } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions/useWorkspaceHostOptions";
import { AgentPicker } from "../../../components/AgentPicker";
import {
	AutomationCapabilitiesPicker,
	type AutomationCapabilityBindingValue,
	type AutomationCapabilitySelectedItem,
} from "../../../components/AutomationCapabilitiesPicker";
import { AutomationModelPicker } from "../../../components/AutomationModelPicker";
import { ProjectPicker } from "../../../components/ProjectPicker";
import { SchedulePicker } from "../../../components/SchedulePicker";
import { TimezonePicker } from "../../../components/TimezonePicker";
import { useRecentProjects } from "../../../hooks/useRecentProjects";
import { supportsAutomationModelSelection } from "../../../utils/agentDisplay";
import { PreviousRunsList } from "../PreviousRunsList";
import { Row } from "./components/Row";
import { Section } from "./components/Section";
import { SectionTitle } from "./components/SectionTitle";

interface AutomationDetailSidebarProps {
	automation: SelectAutomation;
	recentRuns: SelectAutomationRun[];
	selectedRunId?: string | null;
	onSelectRun: (runId: string) => void;
}

type AutomationCapabilityBinding = Awaited<
	ReturnType<typeof apiTrpcClient.capability.listAutomationBindings.query>
>[number];

interface CapabilityDraft {
	automationId: string;
	requestId: number;
	value: AutomationCapabilityBindingValue[];
}

interface CapabilitySaveRequest {
	automationId: string;
	requestId: number;
	capabilities: AutomationCapabilityBindingValue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function capabilityBindingValuesFromAutomation(
	bindings: AutomationCapabilityBinding[],
): AutomationCapabilityBindingValue[] {
	return bindings
		.filter((binding) => binding.enabled)
		.map((binding, index) => ({
			capabilityVersionId: binding.capabilityVersionId,
			enabled: true,
			config: isRecord(binding.config) ? binding.config : {},
			displayOrder: binding.displayOrder ?? index,
		}));
}

function selectedItemsFromAutomationBindings(
	bindings: AutomationCapabilityBinding[],
): AutomationCapabilitySelectedItem[] {
	return bindings
		.filter((binding) => binding.enabled)
		.map((binding) => ({
			capabilityVersionId: binding.capabilityVersionId,
			name: binding.name,
			type: binding.type,
			version: binding.version,
		}));
}

export function AutomationDetailSidebar({
	automation,
	recentRuns,
	selectedRunId,
	onSelectRun,
}: AutomationDetailSidebarProps) {
	const queryClient = useQueryClient();
	const recentProjects = useRecentProjects();
	const { localHostId } = useWorkspaceHostOptions();
	const selectedProject = recentProjects.find(
		(p) => p.id === automation.v2ProjectId,
	);

	const hostId = automation.targetHostId ?? localHostId ?? null;
	const hostUrl = useHostUrl(hostId);
	const { agents: hostAgents } = useV2AgentChoices(hostUrl);
	const modelSelection =
		automation.modelProviderId && automation.modelId
			? {
					providerId: automation.modelProviderId,
					modelId: automation.modelId,
				}
			: null;
	const capabilitySaveQueueRef = useRef<Promise<void>>(Promise.resolve());
	const latestCapabilitySaveRequestIdRef = useRef(0);
	const nextCapabilitySaveRequestIdRef = useRef(0);
	const [capabilityDraft, setCapabilityDraft] =
		useState<CapabilityDraft | null>(null);

	const automationCapabilitiesQuery = useQuery({
		queryKey: ["automation-capabilities", automation.id],
		queryFn: () =>
			apiTrpcClient.capability.listAutomationBindings.query({
				automationId: automation.id,
			}),
		staleTime: 30_000,
	});
	const persistedCapabilityBindings = useMemo(
		() =>
			capabilityBindingValuesFromAutomation(
				automationCapabilitiesQuery.data ?? [],
			),
		[automationCapabilitiesQuery.data],
	);
	const selectedCapabilityItems = useMemo(
		() =>
			selectedItemsFromAutomationBindings(
				automationCapabilitiesQuery.data ?? [],
			),
		[automationCapabilitiesQuery.data],
	);
	const capabilityValue =
		capabilityDraft?.automationId === automation.id
			? capabilityDraft.value
			: persistedCapabilityBindings;

	const updateMutation = useMutation({
		mutationFn: (
			patch: Partial<
				Parameters<typeof apiTrpcClient.automation.update.mutate>[0]
			>,
		) =>
			apiTrpcClient.automation.update.mutate({ id: automation.id, ...patch }),
		onSuccess: (updated) => {
			queryClient.setQueryData(["automation", automation.id], updated);
			void queryClient.invalidateQueries({
				queryKey: ["automations", "list"],
			});
		},
	});
	const enqueueCapabilitySave = (request: CapabilitySaveRequest) => {
		latestCapabilitySaveRequestIdRef.current = request.requestId;

		capabilitySaveQueueRef.current = capabilitySaveQueueRef.current
			.catch(() => undefined)
			.then(async () => {
				if (request.requestId !== latestCapabilitySaveRequestIdRef.current) {
					return;
				}

				try {
					const bindings =
						await apiTrpcClient.capability.setAutomationBindings.mutate({
							automationId: request.automationId,
							capabilities: request.capabilities,
						});
					if (request.requestId !== latestCapabilitySaveRequestIdRef.current) {
						return;
					}
					queryClient.setQueryData(
						["automation-capabilities", request.automationId],
						bindings,
					);
					setCapabilityDraft((draft) =>
						draft?.requestId === request.requestId ? null : draft,
					);
					void queryClient.invalidateQueries({
						queryKey: ["capability", "list"],
					});
				} catch (error) {
					if (request.requestId !== latestCapabilitySaveRequestIdRef.current) {
						return;
					}
					console.error(
						"[AutomationDetailSidebar] failed to update capabilities:",
						error,
					);
					setCapabilityDraft((draft) =>
						draft?.requestId === request.requestId ? null : draft,
					);
				}
			});
	};

	const lastRunAt = recentRuns
		.map((run) => run.scheduledFor)
		.map((d) => (d ? new Date(d) : null))
		.filter((d): d is Date => d !== null)
		.sort((a, b) => b.getTime() - a.getTime())[0];

	return (
		<aside className="flex w-[360px] shrink-0 flex-col overflow-hidden border-l border-border">
			<div className="flex shrink-0 flex-col gap-6 px-5 pt-5 pb-2">
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
									updateMutation.mutate({
										targetHostId: nextHostId,
										v2WorkspaceId: null,
									});
								}}
							/>
						}
					/>
					<Row
						label="Context"
						value={
							<ProjectPicker
								className="-mr-4"
								selectedProject={selectedProject}
								recentProjects={recentProjects}
								onSelectProject={(v2ProjectId) =>
									updateMutation.mutate({ v2ProjectId, v2WorkspaceId: null })
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
						label="Runner"
						value={
							<AgentPicker
								className="-mr-4"
								hostId={hostId}
								value={automation.agent}
								onChange={(id) => {
									updateMutation.mutate({
										agent: id,
										...(supportsAutomationModelSelection(hostAgents, id)
											? {}
											: { modelProviderId: null, modelId: null }),
									});
								}}
							/>
						}
					/>
					{supportsAutomationModelSelection(hostAgents, automation.agent) ? (
						<Row
							label="Model"
							value={
								<AutomationModelPicker
									align="end"
									className="-mr-4 w-[210px]"
									agent={automation.agent}
									agents={hostAgents}
									value={modelSelection}
									onChange={(selection) => {
										updateMutation.mutate(
											selection
												? {
														modelProviderId: selection.providerId,
														modelId: selection.modelId,
													}
												: { modelProviderId: null, modelId: null },
										);
									}}
								/>
							}
						/>
					) : null}
					<Row
						label="Tools & Skills"
						value={
							<AutomationCapabilitiesPicker
								align="end"
								className="-mr-4 w-[210px]"
								value={capabilityValue}
								selectedItems={selectedCapabilityItems}
								onChange={(next) => {
									const requestId = nextCapabilitySaveRequestIdRef.current + 1;
									nextCapabilitySaveRequestIdRef.current = requestId;
									setCapabilityDraft({
										automationId: automation.id,
										requestId,
										value: next,
									});
									enqueueCapabilitySave({
										automationId: automation.id,
										requestId,
										capabilities: next,
									});
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

			<div className="mt-6 flex min-h-0 flex-1 flex-col gap-2 pl-5 pr-3 pb-5">
				<SectionTitle>Previous runs</SectionTitle>
				<div className="min-h-0 flex-1 overflow-y-auto">
					<PreviousRunsList
						runs={recentRuns}
						selectedRunId={selectedRunId}
						onSelectRun={onSelectRun}
					/>
				</div>
			</div>
		</aside>
	);
}
