import type { SelectAutomationRun } from "@superset/db/schema";
import type { RouterOutputs } from "@superset/trpc";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { EmojiTextInput } from "renderer/components/EmojiTextInput";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions/useWorkspaceHostOptions";
import { AgentPicker } from "../../../components/AgentPicker";
import { useProjectFileSearch } from "../../../hooks/useProjectFileSearch";
import { matchAgentChoice } from "../../../utils/agentIdentity";
import { PreviousRunsList } from "../PreviousRunsList";
import { type AutomationUpdatePatch, TriggersCard } from "../TriggersCard";

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
	const [tab, setTab] = useState<DetailTab>("settings");
	const [name, setName] = useState(automation.name);
	const [prompt, setPrompt] = useState(automation.prompt);
	const lastSyncedPromptRef = useRef(automation.prompt);
	const queryClient = useQueryClient();

	useEffect(() => {
		if (automation.prompt !== lastSyncedPromptRef.current) {
			lastSyncedPromptRef.current = automation.prompt;
			setPrompt(automation.prompt);
		}
	}, [automation.prompt]);

	const updateMutation = useMutation({
		mutationFn: (patch: AutomationUpdatePatch) =>
			apiTrpcClient.automation.update.mutate({ id: automation.id, ...patch }),
		// Only the trigger set gets a confirmation. Every other patch shows its
		// own result — the picker relabels, the toggle flips — but a saved
		// trigger set looks exactly like the unsaved one it replaced.
		onSuccess: (_result, patch) => {
			if (patch.triggers) toast.success("Triggers saved");
		},
		// The pickers re-render from the Electric-synced row, so a rejected
		// update silently snaps back without this.
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to update automation",
			),
	});

	const setPromptMutation = useMutation({
		mutationFn: (next: string) =>
			apiTrpcClient.automation.setPrompt.mutate({
				id: automation.id,
				prompt: next,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["automation-versions", automation.id],
			});
		},
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to update prompt",
			),
	});

	const searchFiles = useProjectFileSearch({
		hostId: automation.targetHostId ?? null,
		projectId: automation.v2ProjectId,
	});

	const { localHostId } = useWorkspaceHostOptions();
	const hostId = automation.targetHostId ?? localHostId ?? null;
	const hostUrl = useHostUrl(hostId);
	const { agents: hostAgents } = useV2AgentChoices(hostUrl);
	// Only warn once the host's terminal configs have loaded — the list always
	// contains the built-in Superset chat entry, so length 1 means "not loaded
	// yet / host unreachable", not "agent missing".
	const agentMissing =
		hostAgents.length > 1 && !matchAgentChoice(hostAgents, automation.agent);

	return (
		<div className="flex-1 overflow-y-auto px-8 py-8">
			<div className="mx-auto flex w-full max-w-3xl flex-col">
				<EmojiTextInput
					value={name}
					onChange={setName}
					editable={!readOnly}
					onBlur={(next) => {
						if (readOnly) return;
						const trimmed = next.trim();
						if (trimmed && trimmed !== automation.name) {
							updateMutation.mutate({ name: trimmed });
						}
					}}
					placeholder="Automation title"
					className="mb-3 text-2xl font-semibold"
				/>
				<div className="flex items-center gap-2 text-sm">
					<Switch
						checked={automation.enabled}
						onCheckedChange={onToggleEnabled}
						disabled={readOnly || toggleDisabled}
						aria-label={
							automation.enabled ? "Pause automation" : "Resume automation"
						}
					/>
					<span className="text-muted-foreground">
						{automation.enabled ? "Active" : "Paused"}
					</span>
					{ownerName && (
						<>
							<span className="text-border">|</span>
							<span className="text-muted-foreground">{ownerName}</span>
						</>
					)}
				</div>
				{readOnly && (
					<p className="select-text cursor-text mt-2 text-xs text-muted-foreground">
						Owned by {ownerName ?? "a teammate"} — only they can edit this
						automation.
					</p>
				)}

				<div className="mt-6 mb-6 flex items-center gap-1">
					{(
						[
							{ value: "settings", label: "Settings" },
							{ value: "runs", label: "Run History" },
						] as const
					).map((t) => (
						<button
							key={t.value}
							type="button"
							onClick={() => setTab(t.value)}
							className={cn(
								"rounded-md px-3 py-1.5 text-sm transition-colors",
								tab === t.value
									? "bg-accent font-medium text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{t.label}
						</button>
					))}
				</div>

				{tab === "settings" ? (
					<fieldset disabled={readOnly} className="contents">
						<TriggersCard
							automation={automation}
							hostId={hostId}
							readOnly={readOnly}
							onUpdate={(patch) => updateMutation.mutate(patch)}
							// Awaited, unlike the pickers: the editor holds the only copy
							// of an unsaved set, so it must not clear its dirty state until
							// the write actually lands.
							onSaveTriggers={(triggers) =>
								updateMutation.mutateAsync({ triggers })
							}
						/>

						<span className="mt-8 mb-2 text-sm text-muted-foreground">
							Instructions
						</span>
						<div className="flex flex-col rounded-xl border border-border bg-card/40">
							<div className="min-h-[240px] px-4 py-3">
								<MarkdownEditor
									content={prompt}
									onChange={setPrompt}
									editable={!readOnly}
									onSave={(next) => {
										if (readOnly) return;
										if (next !== automation.prompt) {
											setPromptMutation.mutate(next);
										}
									}}
									placeholder="Add prompt e.g. look for crashes in $sentry"
									searchFiles={searchFiles}
								/>
							</div>
							<div className="flex items-center px-2.5 pb-2.5">
								<AgentPicker
									hostId={hostId}
									disabled={readOnly}
									value={automation.agent}
									onChange={(id) => {
										// The picker is scoped to `hostId` and emits a preset slug
										// when unambiguous, falling back to the instance UUID. If
										// the automation was previously auto-routed (targetHostId
										// null), pin it to the host this value came from so a
										// UUID-shaped agent can't be dispatched to a host that's
										// never seen it.
										const patch: AutomationUpdatePatch = { agent: id };
										if (!automation.targetHostId && hostId) {
											patch.targetHostId = hostId;
										}
										updateMutation.mutate(patch);
									}}
								/>
							</div>
						</div>
						{agentMissing && (
							<p className="select-text cursor-text mt-2 text-xs text-amber-600 dark:text-amber-500">
								This agent no longer exists on the selected device (its agents
								may have been reset). Runs will fail until you pick a new one.
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
