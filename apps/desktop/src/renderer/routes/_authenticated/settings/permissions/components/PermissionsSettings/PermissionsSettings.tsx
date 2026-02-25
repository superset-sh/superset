import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { LuExternalLink } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search/settings-search";

interface PermissionsSettingsProps {
	visibleItems?: SettingItemId[] | null;
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
	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label className="text-sm font-medium">{label}</Label>
				<p className="text-xs text-muted-foreground">{description}</p>
			</div>
			<div className="flex items-center gap-3">
				{granted && (
					<span className="text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-md">
						Granted
					</span>
				)}
				<Button variant="outline" size="sm" onClick={onRequest}>
					<LuExternalLink className="h-3.5 w-3.5 mr-1.5" />
					Edit in System Settings
				</Button>
			</div>
		</div>
	);
}

export function PermissionsSettings({
	visibleItems,
}: PermissionsSettingsProps) {
	const { data: status } = electronTrpc.permissions.getStatus.useQuery(
		undefined,
		{ refetchInterval: 2000 },
	);

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
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Permissions</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Grant these permissions once to avoid repeated prompts. For persistent
					directory access, enable Full Disk Access in System Settings for
					Superset.
				</p>
			</div>

			<div className="space-y-6">
				{isItemVisible(
					SETTING_ITEM_ID.PERMISSIONS_FULL_DISK_ACCESS,
					visibleItems,
				) && (
					<PermissionRow
						label="Full Disk Access"
						description="Persistent access to Documents, Downloads, Desktop, and iCloud from terminal sessions"
						granted={status?.fullDiskAccess}
						onRequest={() => requestFDA.mutate()}
					/>
				)}

				{isItemVisible(
					SETTING_ITEM_ID.PERMISSIONS_ACCESSIBILITY,
					visibleItems,
				) && (
					<PermissionRow
						label="Accessibility"
						description="Send keystrokes, manage windows, and control other applications"
						granted={status?.accessibility}
						onRequest={() => requestA11y.mutate()}
					/>
				)}

				{isItemVisible(
					SETTING_ITEM_ID.PERMISSIONS_MICROPHONE,
					visibleItems,
				) && (
					<PermissionRow
						label="Microphone"
						description="Use voice transcription and push-to-talk features"
						granted={status?.microphone}
						onRequest={() => requestMicrophone.mutate()}
					/>
				)}

				{isItemVisible(
					SETTING_ITEM_ID.PERMISSIONS_APPLE_EVENTS,
					visibleItems,
				) && (
					<PermissionRow
						label="Automation"
						description="Run terminal commands and interact with other applications"
						granted={undefined}
						onRequest={() => requestAppleEvents.mutate()}
					/>
				)}

				{isItemVisible(
					SETTING_ITEM_ID.PERMISSIONS_LOCAL_NETWORK,
					visibleItems,
				) && (
					<PermissionRow
						label="Local Network"
						description="Discover and connect to development servers on your network"
						granted={undefined}
						onRequest={() => requestLocalNetwork.mutate()}
					/>
				)}
			</div>
		</div>
	);
}
