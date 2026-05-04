import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { LuRefreshCw } from "react-icons/lu";
import { env } from "renderer/env.renderer";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import {
	readLastMigrationRunAt,
	useMigrateV1DataToV2,
	V1_MIGRATION_LAST_RUN_AT_EVENT,
} from "renderer/routes/_authenticated/hooks/useMigrateV1DataToV2";
import type { MigrationSummary } from "renderer/routes/_authenticated/hooks/useMigrateV1DataToV2/migrate";
import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";
import { MOCK_ORG_ID } from "shared/constants";
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
	const setOptInV2 = useV2LocalOverrideStore((state) => state.setOptInV2);
	const lastRunAt = useLastMigrationRunAt();

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
								Use the new workspace experience when early access is available.
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
							onCheckedChange={(enabled) => {
								track("surface_toggled", {
									from: isV2CloudEnabled ? "v2" : "v1",
									to: enabled && isRemoteV2Enabled ? "v2" : "v1",
								});
								setOptInV2(enabled);
							}}
							disabled={!isRemoteV2Enabled}
						/>
					</div>
				)}
				{showV1Migration && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label className="text-sm font-medium">v1 → v2 migration</Label>
							<p className="text-xs text-muted-foreground">
								Imports your local v1 projects and workspaces into the v2 cloud.
								Runs automatically on launch — use this to retry if something
								was missed.
							</p>
							{!isV2CloudEnabled ? (
								<p className="text-xs text-muted-foreground">
									Available when v2 is enabled.
								</p>
							) : lastRunAt !== null ? (
								<p className="text-xs text-muted-foreground">
									Last run {formatDistanceToNow(lastRunAt, { addSuffix: true })}
									.
								</p>
							) : null}
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleRerunMigration}
							disabled={!isV2CloudEnabled || isRunning}
							className="gap-1.5 shrink-0"
						>
							<LuRefreshCw
								className={`h-3.5 w-3.5${isRunning ? " animate-spin" : ""}`}
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

function useLastMigrationRunAt(): number | null {
	const { data: session } = authClient.useSession();
	const organizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const [lastRunAt, setLastRunAt] = useState<number | null>(null);
	const [, forceTick] = useState(0);

	useEffect(() => {
		if (!organizationId) {
			setLastRunAt(null);
			return;
		}
		setLastRunAt(readLastMigrationRunAt(organizationId));
		const onUpdate = (event: Event) => {
			const detail = (event as CustomEvent<{ organizationId?: string }>).detail;
			if (detail?.organizationId === organizationId) {
				setLastRunAt(readLastMigrationRunAt(organizationId));
			}
		};
		window.addEventListener(V1_MIGRATION_LAST_RUN_AT_EVENT, onUpdate);
		// Re-render once a minute so "1 minute ago" advances to "2 minutes ago"
		// without requiring a navigation.
		const interval = window.setInterval(() => forceTick((t) => t + 1), 60_000);
		return () => {
			window.removeEventListener(V1_MIGRATION_LAST_RUN_AT_EVENT, onUpdate);
			window.clearInterval(interval);
		};
	}, [organizationId]);

	return lastRunAt;
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
