import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { LuBot, LuRotateCcw, LuShieldAlert } from "react-icons/lu";
import { useConfigureCardWithAgent } from "renderer/hooks/useConfigureCardWithAgent";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	DEFAULT_WORKSPACE_CARD_CONFIG,
	type WorkspaceCardConfig,
} from "shared/workspace-card-config";

interface WorkspaceCardSettingsProps {
	projectId: string;
}

type BooleanCardField = {
	[K in keyof WorkspaceCardConfig]: WorkspaceCardConfig[K] extends boolean
		? K
		: never;
}[keyof WorkspaceCardConfig];

const FIELD_LABELS: Array<{
	key: BooleanCardField;
	label: string;
	description: string;
}> = [
	{
		key: "prTitle",
		label: "Pull request title",
		description: "Show the PR title under the workspace name",
	},
	{
		key: "prChecks",
		label: "PR checks & review",
		description: "CI check status and review decision next to the PR title",
	},
	{
		key: "diffStats",
		label: "Diff stats",
		description: "Added/removed line counts",
	},
	{
		key: "status",
		label: "Agent status",
		description: "Working / needs permission / ready for review line",
	},
	{
		key: "linearTicket",
		label: "Linear ticket",
		description:
			"Ticket key and state from the synced task linked to the branch (uses the org's Linear integration)",
	},
];

export function WorkspaceCardSettings({
	projectId,
}: WorkspaceCardSettingsProps) {
	const utils = electronTrpc.useUtils();
	const configureWithAgent = useConfigureCardWithAgent(projectId);

	const { data: configData } =
		electronTrpc.config.getWorkspaceCardConfig.useQuery({ projectId });
	const config = configData ?? DEFAULT_WORKSPACE_CARD_CONFIG;
	const { data: configSource } =
		electronTrpc.config.getWorkspaceCardConfigSource.useQuery({ projectId });
	const { data: trustState } =
		electronTrpc.config.getWorkspaceCardTrustState.useQuery({ projectId });

	const invalidate = () => {
		void utils.config.getWorkspaceCardConfig.invalidate({ projectId });
		void utils.config.getWorkspaceCardConfigSource.invalidate({ projectId });
		void utils.config.getWorkspaceCardTrustState.invalidate({ projectId });
	};

	const updateMutation =
		electronTrpc.config.updateWorkspaceCardConfig.useMutation({
			onError: (error) =>
				toast.error(`Failed to save card settings: ${error.message}`),
			onMutate: ({ workspaceCard }) => {
				// Optimistic update: rapid toggles build on the latest cache value
				// rather than a potentially stale snapshot, preventing lost updates.
				utils.config.getWorkspaceCardConfig.setData(
					{ projectId },
					workspaceCard as WorkspaceCardConfig,
				);
			},
			onSettled: invalidate,
		});

	const resetMutation =
		electronTrpc.config.resetWorkspaceCardConfig.useMutation({
			onError: (error) =>
				toast.error(`Failed to reset card settings: ${error.message}`),
			onSettled: invalidate,
		});

	const trustMutation = electronTrpc.config.trustCardCommands.useMutation({
		onError: (error) =>
			toast.error(`Failed to approve commands: ${error.message}`),
		onSettled: invalidate,
	});

	const handleToggle = (key: BooleanCardField, value: boolean) => {
		// Read from cache at call time to chain correctly with optimistic updates.
		const latest =
			utils.config.getWorkspaceCardConfig.getData({ projectId }) ?? config;
		updateMutation.mutate({
			projectId,
			workspaceCard: { ...latest, [key]: value },
		});
	};

	const pendingCount = trustState?.pendingCommandCount ?? 0;

	return (
		<div className="space-y-4">
			{pendingCount > 0 && (
				<div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
					<LuShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
					<div className="min-w-0 flex-1">
						<p className="font-medium text-foreground">
							Repo-defined command{pendingCount === 1 ? "" : "s"}/widget
							{pendingCount === 1 ? "" : "s"} pending approval
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							This project&apos;s{" "}
							<code className="font-mono">.superset/config.json</code> defines{" "}
							{pendingCount} command{pendingCount === 1 ? "" : "s"} or widget
							{pendingCount === 1 ? "" : "s"} that run code (shell commands and{" "}
							<code className="font-mono">.superset/widgets/*.tsx</code>{" "}
							modules) on each workspace card. Editing a widget file re-arms
							this approval. Approve to enable them.
						</p>
						<div className="mt-2 flex gap-2">
							<Button
								size="sm"
								variant="outline"
								className="h-7 border-amber-500/40 text-xs"
								onClick={() => trustMutation.mutate({ projectId })}
								disabled={trustMutation.isPending}
							>
								Run them
							</Button>
							<Button
								size="sm"
								variant="ghost"
								className="h-7 text-xs text-muted-foreground"
								disabled={trustMutation.isPending}
							>
								Keep disabled
							</Button>
						</div>
					</div>
				</div>
			)}
			{FIELD_LABELS.map(({ key, label, description }) => (
				<div key={key} className="flex items-center justify-between gap-4">
					<div className="min-w-0">
						<p className="text-sm text-foreground">{label}</p>
						<p className="text-xs text-muted-foreground">{description}</p>
					</div>
					<Switch
						checked={config[key]}
						onCheckedChange={(value) => handleToggle(key, value)}
						disabled={updateMutation.isPending}
					/>
				</div>
			))}
			<div className="flex items-center justify-end gap-2 pt-1">
				{configSource === "override" && (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => resetMutation.mutate({ projectId })}
						disabled={resetMutation.isPending}
						className="gap-1.5 text-muted-foreground"
					>
						<LuRotateCcw className="size-3.5" />
						Reset to repo config
					</Button>
				)}
				<Button
					variant="outline"
					size="sm"
					onClick={configureWithAgent}
					className="gap-1.5"
				>
					<LuBot className="size-3.5" />
					Configure with agent
				</Button>
			</div>
		</div>
	);
}
