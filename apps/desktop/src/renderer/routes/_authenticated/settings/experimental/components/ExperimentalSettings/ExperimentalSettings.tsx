import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useEffect, useState } from "react";
import {
	useIsV2CloudEnabled,
	useIsV2OnlyUser,
} from "renderer/hooks/useIsV2CloudEnabled";
import { track } from "renderer/lib/analytics";
import { writeDesktopRuntimeFlagsToLocalStorage } from "renderer/lib/desktop-runtime-flags";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useOpenV1ImportModal } from "renderer/stores/v1-import-modal";
import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";
import {
	type DesktopRuntimeFlags,
	defaultDesktopRuntimeFlags,
	normalizeDesktopRuntimeFlags,
} from "shared/desktop-runtime-flags";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

interface ExperimentalSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

function areRuntimeFlagsEqual(
	a: DesktopRuntimeFlags,
	b: DesktopRuntimeFlags | undefined,
): boolean {
	return (
		JSON.stringify(normalizeDesktopRuntimeFlags(a)) ===
		JSON.stringify(normalizeDesktopRuntimeFlags(b))
	);
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
	const showDesktopRuntimeFlags = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_DESKTOP_RUNTIME_FLAGS,
		visibleItems,
	);
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const isV2OnlyUser = useIsV2OnlyUser();
	const setOptInV2 = useV2LocalOverrideStore((state) => state.setOptInV2);
	const openV1ImportModal = useOpenV1ImportModal();
	const utils = electronTrpc.useUtils();
	const { data: persistedRuntimeFlags, isLoading: isRuntimeFlagsLoading } =
		electronTrpc.settings.getDesktopRuntimeFlags.useQuery();
	const [runtimeFlagsDraft, setRuntimeFlagsDraft] =
		useState<DesktopRuntimeFlags>(defaultDesktopRuntimeFlags);
	const [runtimeFlagsError, setRuntimeFlagsError] = useState<string | null>(
		null,
	);

	useEffect(() => {
		if (!persistedRuntimeFlags) return;
		const normalized = normalizeDesktopRuntimeFlags(persistedRuntimeFlags);
		setRuntimeFlagsDraft(normalized);
		writeDesktopRuntimeFlagsToLocalStorage(normalized);
	}, [persistedRuntimeFlags]);

	const saveRuntimeFlags =
		electronTrpc.settings.setDesktopRuntimeFlags.useMutation({
			onSuccess: (nextFlags) => {
				const normalized = normalizeDesktopRuntimeFlags(nextFlags);
				setRuntimeFlagsDraft(normalized);
				writeDesktopRuntimeFlagsToLocalStorage(normalized);
				utils.settings.getDesktopRuntimeFlags.setData(undefined, normalized);
				setRuntimeFlagsError(null);
			},
			onError: (error) => {
				setRuntimeFlagsError(error.message);
			},
		});
	const restartApp = electronTrpc.settings.restartApp.useMutation();

	const updateRuntimeFlagsDraft = (patch: Partial<DesktopRuntimeFlags>) => {
		setRuntimeFlagsDraft((current) =>
			normalizeDesktopRuntimeFlags({ ...current, ...patch }),
		);
		setRuntimeFlagsError(null);
	};

	const hasUnsavedRuntimeFlags = !areRuntimeFlagsEqual(
		runtimeFlagsDraft,
		persistedRuntimeFlags,
	);
	const runtimeControlsDisabled =
		isRuntimeFlagsLoading || saveRuntimeFlags.isPending;

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
				{showDesktopRuntimeFlags && (
					<div className="space-y-4 pt-4 border-t border-border">
						<div className="flex items-start justify-between gap-6">
							<div className="min-w-0 flex-1 space-y-0.5">
								<Label className="text-sm font-medium">
									Desktop diagnostics
								</Label>
								<p className="text-xs text-muted-foreground">
									Performance switches for Windows port testing. Cloud login and
									sync stay enabled. Changes apply after restart.
								</p>
							</div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => restartApp.mutate()}
								disabled={restartApp.isPending}
								className="shrink-0"
							>
								Restart app
							</Button>
						</div>
						<div className="flex items-center justify-between gap-6">
							<div className="min-w-0 flex-1 space-y-0.5">
								<Label htmlFor="disable-auto-update" className="text-sm">
									Disable auto-update checks
								</Label>
								<p className="text-xs text-muted-foreground">
									Stops packaged builds from polling GitHub update manifests.
								</p>
							</div>
							<Switch
								id="disable-auto-update"
								checked={runtimeFlagsDraft.disableAutoUpdate}
								disabled={runtimeControlsDisabled}
								onCheckedChange={(disableAutoUpdate) =>
									updateRuntimeFlagsDraft({ disableAutoUpdate })
								}
							/>
						</div>
						<div className="flex items-center justify-between gap-6">
							<div className="min-w-0 flex-1 space-y-0.5">
								<Label htmlFor="disable-analytics" className="text-sm">
									Disable analytics
								</Label>
								<p className="text-xs text-muted-foreground">
									Stops PostHog initialization and main-process telemetry.
								</p>
							</div>
							<Switch
								id="disable-analytics"
								checked={runtimeFlagsDraft.disableAnalytics}
								disabled={runtimeControlsDisabled}
								onCheckedChange={(disableAnalytics) =>
									updateRuntimeFlagsDraft({ disableAnalytics })
								}
							/>
						</div>
					</div>
				)}
				{showDesktopRuntimeFlags && (
					<div className="flex items-center justify-between gap-4 pt-2">
						<p className="text-xs text-muted-foreground">
							{runtimeFlagsError ??
								(hasUnsavedRuntimeFlags
									? "Unsaved changes need a restart after saving."
									: "Runtime flags are saved.")}
						</p>
						<Button
							type="button"
							size="sm"
							onClick={() => saveRuntimeFlags.mutate(runtimeFlagsDraft)}
							disabled={runtimeControlsDisabled || !hasUnsavedRuntimeFlags}
						>
							{saveRuntimeFlags.isPending ? "Saving..." : "Save changes"}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
