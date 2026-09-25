import { Trans, useLingui } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { Skeleton } from "@superset/ui/skeleton";
import { LuExternalLink } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search/settings-search";

interface PermissionsSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

function StatusBadge({ granted }: { granted: boolean | undefined }) {
	if (granted === true) {
		return (
			<Badge variant="secondary">
				<Trans>Granted</Trans>
			</Badge>
		);
	}
	if (granted === false) {
		return (
			<Badge variant="outline">
				<Trans>Not granted</Trans>
			</Badge>
		);
	}
	return (
		<Badge variant="outline">
			<Trans>Unknown</Trans>
		</Badge>
	);
}

function PermissionRow({
	label,
	description,
	granted,
	onRequest,
}: {
	label: string;
	description: string;
	granted: boolean | undefined;
	onRequest: () => void;
}) {
	const searchQuery = useSettingsSearchQuery();

	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label className="text-sm font-medium">
					<HighlightText text={label} query={searchQuery} />
				</Label>
				<p className="text-xs text-muted-foreground">
					<HighlightText text={description} query={searchQuery} />
				</p>
			</div>
			<div className="flex items-center gap-3 shrink-0">
				<StatusBadge granted={granted} />
				<Button variant="outline" size="sm" onClick={onRequest}>
					<LuExternalLink className="h-3.5 w-3.5 mr-1.5" />
					<Trans>Open settings</Trans>
				</Button>
			</div>
		</div>
	);
}

function PermissionRowSkeleton() {
	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-1.5">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-64" />
			</div>
			<div className="flex items-center gap-3 shrink-0">
				<Skeleton className="h-5 w-16 rounded-full" />
				<Skeleton className="h-8 w-32" />
			</div>
		</div>
	);
}

export function PermissionsSettings({
	visibleItems,
}: PermissionsSettingsProps) {
	const { t } = useLingui();
	const { data: status, isLoading } =
		electronTrpc.permissions.getStatus.useQuery(undefined, {
			refetchInterval: 2000,
		});

	const requestFDA =
		electronTrpc.permissions.requestFullDiskAccess.useMutation();
	const requestA11y =
		electronTrpc.permissions.requestAccessibility.useMutation();
	const requestMicrophone =
		electronTrpc.permissions.requestMicrophone.useMutation();
	const requestAppleEvents =
		electronTrpc.permissions.requestAppleEvents.useMutation();
	const requestLocalNetwork =
		electronTrpc.permissions.requestLocalNetwork.useMutation();

	return (
		<div className="p-6 max-w-4xl w-full mx-auto">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans>Permissions</Trans>
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					<Trans>Grant the OS permissions Superset needs.</Trans>
				</p>
			</div>

			<div className="space-y-6">
				{isLoading ? (
					<>
						<PermissionRowSkeleton />
						<PermissionRowSkeleton />
						<PermissionRowSkeleton />
					</>
				) : (
					<>
						{isItemVisible(
							SETTING_ITEM_ID.PERMISSIONS_FULL_DISK_ACCESS,
							visibleItems,
						) && (
							<PermissionRow
								label={t({
									message: "Full Disk Access",
								})}
								description={t({
									message:
										"Persistent access to Documents, Downloads, Desktop, and iCloud.",
								})}
								granted={status?.fullDiskAccess}
								onRequest={() => requestFDA.mutate()}
							/>
						)}

						{isItemVisible(
							SETTING_ITEM_ID.PERMISSIONS_ACCESSIBILITY,
							visibleItems,
						) && (
							<PermissionRow
								label={t({
									message: "Accessibility",
								})}
								description={t({
									message:
										"Send keystrokes, manage windows, and control other applications.",
								})}
								granted={status?.accessibility}
								onRequest={() => requestA11y.mutate()}
							/>
						)}

						{isItemVisible(
							SETTING_ITEM_ID.PERMISSIONS_MICROPHONE,
							visibleItems,
						) && (
							<PermissionRow
								label={t({
									message: "Microphone",
								})}
								description={t({
									message: "Use voice transcription and push-to-talk features.",
								})}
								granted={status?.microphone}
								onRequest={() => requestMicrophone.mutate()}
							/>
						)}

						{isItemVisible(
							SETTING_ITEM_ID.PERMISSIONS_APPLE_EVENTS,
							visibleItems,
						) && (
							<PermissionRow
								label={t({
									message: "Automation",
								})}
								description={t({
									message:
										"Run terminal commands and interact with other applications.",
								})}
								granted={undefined}
								onRequest={() => requestAppleEvents.mutate()}
							/>
						)}

						{isItemVisible(
							SETTING_ITEM_ID.PERMISSIONS_LOCAL_NETWORK,
							visibleItems,
						) && (
							<PermissionRow
								label={t({
									message: "Local Network",
								})}
								description={t({
									message:
										"Discover and connect to development servers on your network.",
								})}
								granted={undefined}
								onRequest={() => requestLocalNetwork.mutate()}
							/>
						)}
					</>
				)}
			</div>
		</div>
	);
}
