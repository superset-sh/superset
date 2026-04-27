import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { LuRefreshCw } from "react-icons/lu";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useMigrateV1DataToV2 } from "renderer/routes/_authenticated/hooks/useMigrateV1DataToV2";
import type { MigrationSummary } from "renderer/routes/_authenticated/hooks/useMigrateV1DataToV2/migrate";
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
	const { isV2CloudEnabled, isRemoteV2Enabled } = useIsV2CloudEnabled();
	const { rerun, isRunning } = useMigrateV1DataToV2({ autoRun: false });
	const setForceV1 = useV2LocalOverrideStore((state) => state.setForceV1);

	async function rerunMigration() {
		const result = await rerun();
		if (!result.completed) throw new Error(result.reason);
		return result.summary;
	}

	function handleRerunMigration() {
		toast.promise(rerunMigration(), {
			loading: "Running migration...",
			success: (summary) => formatMigrationSuccess(summary),
			error: (err) => `Migration run failed: ${errorMessage(err)}`,
		});
	}

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Experimental</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Try early access features and previews
				</p>
			</div>

			<div className="space-y-6">
				{showSupersetV2 && (
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label htmlFor="superset-v2" className="text-sm font-medium">
								Try Superset Version 2 (Early Access)
							</Label>
							<p className="text-xs text-muted-foreground">
								Use the new workspace experience when early access is available
							</p>
							{!isRemoteV2Enabled && (
								<p className="text-xs text-muted-foreground">
									Early access is not enabled for this account.
								</p>
							)}
						</div>
						<Switch
							id="superset-v2"
							checked={isV2CloudEnabled}
							onCheckedChange={(enabled) => setForceV1(!enabled)}
							disabled={!isRemoteV2Enabled}
						/>
					</div>
				)}
				{showV1Migration && (
					<div className="flex items-center justify-between border-t pt-6">
						<div className="space-y-0.5">
							<Label className="text-sm font-medium">V1 to V2 migration</Label>
							<p className="text-xs text-muted-foreground">
								Rerun project and workspace import for this organization
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							onClick={handleRerunMigration}
							disabled={!isV2CloudEnabled || isRunning}
						>
							<LuRefreshCw
								className={`h-4 w-4${isRunning ? " animate-spin" : ""}`}
								strokeWidth={2}
							/>
							{isRunning ? "Running" : "Run again"}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}

function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

function formatMigrationSuccess(summary: MigrationSummary): string {
	const changed =
		summary.projectsCreated +
		summary.projectsLinked +
		summary.projectsErrored +
		summary.workspacesCreated +
		summary.workspacesSkipped +
		summary.workspacesErrored;
	if (summary.errors.length > 0) {
		const first = summary.errors[0];
		const successful =
			summary.projectsCreated +
			summary.projectsLinked +
			summary.workspacesCreated +
			summary.workspacesSkipped;
		const successSuffix =
			successful > 0
				? ` (${successful} item${successful === 1 ? "" : "s"} completed or skipped)`
				: "";
		return `Migration completed with ${summary.errors.length} error${
			summary.errors.length === 1 ? "" : "s"
		}${successSuffix}: ${first.name}: ${first.message}`;
	}
	if (
		summary.projectsCreated + summary.projectsLinked === 0 &&
		summary.workspacesCreated === 0 &&
		summary.workspacesSkipped > 0
	) {
		return `Migration run completed: ${summary.workspacesSkipped} workspace${
			summary.workspacesSkipped === 1 ? "" : "s"
		} skipped`;
	}
	if (changed === 0) return "Migration run completed: nothing to update";
	const skippedSuffix =
		summary.workspacesSkipped > 0
			? ` (+${summary.workspacesSkipped} skipped)`
			: "";
	return `Migration run completed: ${summary.projectsCreated + summary.projectsLinked} project${
		summary.projectsCreated + summary.projectsLinked === 1 ? "" : "s"
	}, ${summary.workspacesCreated} workspace${
		summary.workspacesCreated === 1 ? "" : "s"
	}${skippedSuffix}`;
}
