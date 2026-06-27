import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import {
	useIsV2CloudEnabled,
	useIsV2OnlyUser,
} from "renderer/hooks/useIsV2CloudEnabled";
import { track } from "renderer/lib/analytics";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useOpenV1ImportModal } from "renderer/stores/v1-import-modal";
import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

interface ExperimentalSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function ExperimentalSettings({
	visibleItems,
}: ExperimentalSettingsProps) {
	const showSupersetV2 = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_SUPERSET_V2,
		visibleItems,
	);
	const showV1Migration = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_V1_MIGRATION,
		visibleItems,
	);
	const showAcpChat = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_ACP_CHAT,
		visibleItems,
	);
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const isV2OnlyUser = useIsV2OnlyUser();
	const setOptInV2 = useV2LocalOverrideStore((state) => state.setOptInV2);
	const openV1ImportModal = useOpenV1ImportModal();
	const utils = electronTrpc.useUtils();
	const { data: acpChatEnabled = false, isLoading: isAcpChatLoading } =
		electronTrpc.settings.getExperimentalAcpChat.useQuery();
	const setAcpChat = electronTrpc.settings.setExperimentalAcpChat.useMutation({
		onMutate: async ({ enabled }) => {
			await utils.settings.getExperimentalAcpChat.cancel();
			const previous = utils.settings.getExperimentalAcpChat.getData();
			utils.settings.getExperimentalAcpChat.setData(undefined, enabled);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getExperimentalAcpChat.setData(
					undefined,
					context.previous,
				);
			}
		},
		onSettled: () => {
			utils.settings.getExperimentalAcpChat.invalidate();
		},
	});
	const handleAcpChatChange = (enabled: boolean) => {
		track("experimental_acp_chat_toggled", { enabled });
		toast.promise(setAcpChat.mutateAsync({ enabled }), {
			loading: "Restarting host services…",
			success: ({ restartedOrgCount }) =>
				restartedOrgCount > 0
					? `Restarted ${restartedOrgCount} host service${restartedOrgCount === 1 ? "" : "s"}`
					: "Setting saved",
			error: (err: Error) => err.message ?? "Failed to update setting",
		});
	};

	return (
		<div className="p-6 max-w-4xl w-full mx-auto">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Experimental</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Try early access features and previews.
				</p>
			</div>

			<div className="space-y-6">
				{showSupersetV2 && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label htmlFor="superset-v2" className="text-sm font-medium">
								Try Superset v2
							</Label>
							<p className="text-xs text-muted-foreground">
								Use the new workspace experience.
							</p>
						</div>
						<Switch
							id="superset-v2"
							checked={isV2CloudEnabled}
							onCheckedChange={(enabled) => {
								track("surface_toggled", {
									from: isV2CloudEnabled ? "v2" : "v1",
									to: enabled ? "v2" : "v1",
								});
								setOptInV2(enabled);
							}}
						/>
					</div>
				)}
				{showAcpChat && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label
								htmlFor="experimental-acp-chat"
								className="text-sm font-medium"
							>
								Use ACP chat runtime
							</Label>
							<p className="text-xs text-muted-foreground">
								Run workspace chat through the Agent Client Protocol instead of
								the default Mastra chat runtime. Host services restart when this
								changes.
							</p>
						</div>
						<Switch
							id="experimental-acp-chat"
							checked={acpChatEnabled}
							disabled={isAcpChatLoading || setAcpChat.isPending}
							onCheckedChange={handleAcpChatChange}
						/>
					</div>
				)}
				{showV1Migration && !isV2OnlyUser && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label className="text-sm font-medium">Import from v1</Label>
							<p className="text-xs text-muted-foreground">
								Bring v1 projects, workspaces, and terminal presets over to v2.
								Each item is imported individually and can be retried.
							</p>
							{!isV2CloudEnabled && (
								<p className="text-xs text-muted-foreground">
									Available when v2 is enabled.
								</p>
							)}
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => openV1ImportModal()}
							disabled={!isV2CloudEnabled}
							className="shrink-0"
						>
							Open importer
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
