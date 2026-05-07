import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useNavigate } from "@tanstack/react-router";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { track } from "renderer/lib/analytics";
import { STEP_ROUTES, useOnboardingStore } from "renderer/stores/onboarding";
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
	const showRestartOnboarding = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_RESTART_ONBOARDING,
		visibleItems,
	);
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const setOptInV2 = useV2LocalOverrideStore((state) => state.setOptInV2);
	const resetOnboarding = useOnboardingStore((state) => state.reset);
	const openV1ImportModal = useOpenV1ImportModal();
	const navigate = useNavigate();

	function handleRestartOnboarding() {
		resetOnboarding();
		void navigate({ to: STEP_ROUTES.providers });
	}

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
				{showV1Migration && (
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
				{showRestartOnboarding && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label className="text-sm font-medium">Restart onboarding</Label>
							<p className="text-xs text-muted-foreground">
								Walk through the v2 setup flow again from the beginning.
							</p>
							{!isV2CloudEnabled && (
								<p className="text-xs text-muted-foreground">
									Available when v2 is enabled.
								</p>
							)}
						</div>
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={!isV2CloudEnabled}
									className="shrink-0"
								>
									Restart
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Restart onboarding?</AlertDialogTitle>
									<AlertDialogDescription>
										This clears your onboarding progress and reopens the setup
										flow. You'll walk through each step again — for steps you're
										already configured for (provider connected, project
										attached), you'll see the current status with a Continue
										button.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction onClick={handleRestartOnboarding}>
										Restart
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				)}
			</div>
		</div>
	);
}
