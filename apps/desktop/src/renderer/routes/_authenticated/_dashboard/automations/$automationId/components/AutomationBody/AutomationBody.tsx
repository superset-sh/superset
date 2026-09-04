import { Trans, useLingui } from "@lingui/react/macro";
import type { SelectAutomationRun } from "@superset/db/schema";
import { errorMessage } from "@superset/i18n/errors";
import type { DraftTrigger } from "@superset/shared/automation-triggers";
import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { EmojiTextInput } from "renderer/components/EmojiTextInput";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions/useWorkspaceHostOptions";
import { AgentPicker } from "../../../components/AgentPicker";
import { useProviderOptions } from "../../../components/providers/useProviderOptions";
import { useProjectFileSearch } from "../../../hooks/useProjectFileSearch";
import { matchAgentChoice } from "../../../utils/agentIdentity";
import { PreviousRunsList } from "../PreviousRunsList";
import {
	type AutomationUpdatePatch,
	type ScopeDraft,
	TriggersCard,
} from "../TriggersCard";
import { useAutomationDraft } from "./hooks/useAutomationDraft";

type DetailTab = "settings" | "runs";

export function AutomationBody({
	automation,
	recentRuns,
	ownerName,
	readOnly,
	onToggleEnabled,
	toggleDisabled,
}: {
	/** `get` output plus the prompt body, which rides its own procedure. */
	automation: RouterOutputs["automation"]["get"] & { prompt: string };
	recentRuns: SelectAutomationRun[];
	ownerName?: string | null;
	readOnly?: boolean;
	onToggleEnabled: (enabled: boolean) => void;
	toggleDisabled?: boolean;
}) {
	const { t } = useLingui();
	const [tab, setTab] = useState<DetailTab>("settings");
	const queryClient = useQueryClient();

	const updateMutation = useMutation({
		mutationFn: (patch: AutomationUpdatePatch) =>
			apiTrpcClient.automation.update.mutate({ id: automation.id, ...patch }),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["automation-versions", automation.id],
			}),
		onError: (error) =>
			toast.error(
				errorMessage(
					error,
					t({
						message: "Failed to update automation",
					}),
				),
			),
	});

	const saved = useMemo(
		() => ({
			name: automation.name,
			prompt: automation.prompt,
			agent: automation.agent,
			targetHostId: automation.targetHostId,
			v2ProjectId: automation.v2ProjectId,
			v2WorkspaceId: automation.v2WorkspaceId,
			tags: automation.tags,
			triggers: automation.triggers.map((trigger) => ({
				id: trigger.id,
				config: trigger.config as DraftTrigger["config"],
			})),
		}),
		[automation],
	);

	const {
		draft,
		dirty,
		saving,
		shownProblems,
		banner,
		edit,
		editTriggers,
		save,
		discard,
	} = useAutomationDraft(saved, async (next) => {
		await updateMutation.mutateAsync(next);
		toast.success(
			t({
				message: "Automation saved",
			}),
		);
		// Saving may have joined channels, which flips `botMember`.
		optionState.slack?.refetch();
	});

	const { options, state: optionState } = useProviderOptions(
		automation.organizationId,
		draft.triggers,
	);

	const searchFiles = useProjectFileSearch({
		hostId: draft.targetHostId,
		projectId: draft.v2ProjectId,
	});

	const { localHostId } = useWorkspaceHostOptions();
	const hostId = draft.targetHostId ?? localHostId ?? null;
	const hostUrl = useHostUrl(hostId);
	const { agents: hostAgents, isFetched: hostAgentsFetched } =
		useV2AgentChoices(hostUrl);
	// Only warn once the host's terminal configs have loaded — the Superset
	// chat entry is flag-gated, so list length alone can't tell "not loaded
	// yet / host unreachable" apart from "agent missing".
	const agentMissing =
		hostAgentsFetched &&
		hostAgents.length > 0 &&
		!matchAgentChoice(hostAgents, draft.agent);

	return (
		<div className="flex-1 overflow-y-auto px-12 py-8">
			{/* Full width, not a centered max-w column: a Slack sentence is wider
			    than 3xl and would wrap onto a second line, shifting the rows below
			    every time one renders. */}
			<div className="flex w-full flex-col">
				<div className="mb-3 flex items-start gap-3">
					<EmojiTextInput
						value={draft.name}
						onChange={(next) => edit({ name: next })}
						editable={!readOnly}
						onBlur={(next) => {
							if (readOnly) return;
							edit({ name: next.trim() || automation.name });
						}}
						placeholder={t({
							message: "Automation title",
						})}
						className="min-w-0 flex-1 text-2xl font-semibold"
					/>
					{dirty && !readOnly && (
						<div className="flex shrink-0 items-center gap-1.5 pt-1">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={discard}
								disabled={saving}
								className="h-7 text-[13px]"
							>
								<Trans>Discard</Trans>
							</Button>
							<Button
								type="button"
								size="sm"
								onClick={save}
								disabled={saving}
								className="h-7 text-[13px]"
							>
								{saving ? <Trans>Saving...</Trans> : <Trans>Save</Trans>}
							</Button>
						</div>
					)}
				</div>
				<div className="flex items-center gap-2 text-sm">
					<Switch
						checked={automation.enabled}
						onCheckedChange={onToggleEnabled}
						disabled={readOnly || toggleDisabled}
						aria-label={
							automation.enabled
								? t({
										message: "Pause automation",
									})
								: t({
										message: "Resume automation",
									})
						}
					/>
					<span className="text-muted-foreground">
						{automation.enabled ? <Trans>Active</Trans> : <Trans>Paused</Trans>}
					</span>
					{ownerName && (
						<>
							<span className="text-border">|</span>
							<span className="text-muted-foreground">{ownerName}</span>
						</>
					)}

					{banner && (
						<p className="flex min-w-0 items-center gap-1.5 text-[13px] text-amber-600 dark:text-amber-400">
							<LuTriangleAlert className="size-3.5 shrink-0" />
							<span className="truncate">{banner}</span>
						</p>
					)}
				</div>
				{readOnly && (
					<p className="select-text cursor-text mt-2 text-xs text-muted-foreground">
						<Trans>
							Owned by{" "}
							{ownerName ??
								t({
									message: "a teammate",
								})}{" "}
							— only they can edit this automation.
						</Trans>
					</p>
				)}

				<div className="mt-6 mb-6 flex items-center gap-1">
					{(
						[
							{
								value: "settings",
								label: t({
									message: "Settings",
								}),
							},
							{
								value: "runs",
								label: t({
									message: "Run History",
								}),
							},
						] as const
					).map((tabOption) => (
						<button
							key={tabOption.value}
							type="button"
							onClick={() => setTab(tabOption.value)}
							className={cn(
								"rounded-md px-3 py-1.5 text-sm transition-colors",
								tab === tabOption.value
									? "bg-accent font-medium text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{tabOption.label}
						</button>
					))}
				</div>

				{tab === "settings" ? (
					<fieldset disabled={readOnly} className="contents">
						<TriggersCard
							automation={automation}
							hostId={hostId}
							readOnly={readOnly}
							scope={{
								v2ProjectId: draft.v2ProjectId,
								targetHostId: draft.targetHostId,
								v2WorkspaceId: draft.v2WorkspaceId,
								tags: draft.tags,
							}}
							onScopeChange={(patch: Partial<ScopeDraft>) => edit(patch)}
							drafts={draft.triggers}
							onEditTriggers={editTriggers}
							problems={shownProblems}
							options={options}
							optionState={optionState}
						/>

						<span className="mt-8 mb-2 text-sm text-muted-foreground">
							<Trans>Instructions</Trans>
						</span>
						<div className="flex flex-col rounded-xl border border-border bg-card/40">
							<div className="min-h-[240px] px-4 py-3">
								<MarkdownEditor
									content={draft.prompt}
									// No onSave: it fires on blur, which would save twice.
									onChange={(next: string) => edit({ prompt: next })}
									editable={!readOnly}
									placeholder={t({
										message: "Add prompt e.g. look for crashes in $sentry",
									})}
									searchFiles={searchFiles}
								/>
							</div>
							<div className="flex items-center px-2.5 pb-2.5">
								<AgentPicker
									hostId={hostId}
									disabled={readOnly}
									value={draft.agent}
									onChange={(id) => {
										// The picker is scoped to `hostId` and emits a preset slug
										// when unambiguous, falling back to the instance UUID. If
										// the automation was previously auto-routed (targetHostId
										// null), pin it to the host this value came from so a
										// UUID-shaped agent can't be dispatched to a host that's
										// never seen it.
										edit({
											agent: id,
											...(!draft.targetHostId && hostId
												? { targetHostId: hostId }
												: {}),
										});
									}}
								/>
							</div>
						</div>
						{agentMissing && (
							<p className="select-text cursor-text mt-2 text-xs text-amber-600 dark:text-amber-500">
								<Trans>
									This agent no longer exists on the selected device (its agents
									may have been reset). Runs will fail until you pick a new one.
								</Trans>
							</p>
						)}
					</fieldset>
				) : (
					<PreviousRunsList runs={recentRuns} />
				)}
			</div>
		</div>
	);
}
