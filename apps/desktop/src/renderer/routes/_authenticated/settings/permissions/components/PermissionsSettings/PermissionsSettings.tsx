import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { LuCheck, LuExternalLink } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search/settings-search";

interface PermissionsSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function PermissionsSettings({
	visibleItems,
}: PermissionsSettingsProps) {
	const showFDA = isItemVisible(
		SETTING_ITEM_ID.PERMISSIONS_FULL_DISK_ACCESS,
		visibleItems,
	);
	const showA11y = isItemVisible(
		SETTING_ITEM_ID.PERMISSIONS_ACCESSIBILITY,
		visibleItems,
	);

	const { data: status } = electronTrpc.permissions.getStatus.useQuery(
		undefined,
		{ refetchInterval: 2000 },
	);

	const requestFDA =
		electronTrpc.permissions.requestFullDiskAccess.useMutation();
	const requestA11y =
		electronTrpc.permissions.requestAccessibility.useMutation();

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Permissions</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Grant these permissions to avoid repeated macOS prompts. Open System
					Settings and enable the toggle for Superset.
				</p>
			</div>

			<div className="space-y-6">
				{showFDA && (
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label className="text-sm font-medium">Full Disk Access</Label>
							<p className="text-xs text-muted-foreground">
								Access files in Documents, Downloads, Desktop, and iCloud from
								the terminal
							</p>
						</div>
						{status?.fullDiskAccess ? (
							<div className="flex items-center gap-1.5 text-sm text-green-500">
								<LuCheck className="h-4 w-4" />
								<span>Granted</span>
							</div>
						) : (
							<Button
								variant="outline"
								size="sm"
								onClick={() => requestFDA.mutate()}
							>
								<LuExternalLink className="h-3.5 w-3.5 mr-1.5" />
								Open System Settings
							</Button>
						)}
					</div>
				)}

				{showA11y && (
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label className="text-sm font-medium">Accessibility</Label>
							<p className="text-xs text-muted-foreground">
								Control other apps, send keystrokes, and manage windows
							</p>
						</div>
						{status?.accessibility ? (
							<div className="flex items-center gap-1.5 text-sm text-green-500">
								<LuCheck className="h-4 w-4" />
								<span>Granted</span>
							</div>
						) : (
							<Button
								variant="outline"
								size="sm"
								onClick={() => requestA11y.mutate()}
							>
								<LuExternalLink className="h-3.5 w-3.5 mr-1.5" />
								Open System Settings
							</Button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
