import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { ExposeViaRelayConfirmDialog } from "./components/ExposeViaRelayConfirmDialog";

interface SecuritySettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function SecuritySettings({ visibleItems }: SecuritySettingsProps) {
	const showRelayToggle = isItemVisible(
		SETTING_ITEM_ID.SECURITY_EXPOSE_HOST_SERVICE_VIA_RELAY,
		visibleItems,
	);

	const utils = electronTrpc.useUtils();
	const { data: exposeEnabled, isLoading } =
		electronTrpc.settings.getExposeHostServiceViaRelay.useQuery();

	const setExpose =
		electronTrpc.settings.setExposeHostServiceViaRelay.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getExposeHostServiceViaRelay.cancel();
				const previous = utils.settings.getExposeHostServiceViaRelay.getData();
				utils.settings.getExposeHostServiceViaRelay.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getExposeHostServiceViaRelay.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getExposeHostServiceViaRelay.invalidate();
			},
		});

	const [confirmOpen, setConfirmOpen] = useState(false);

	const runToggle = (enabled: boolean) => {
		toast.promise(setExpose.mutateAsync({ enabled }), {
			loading: "Restarting host services…",
			success: ({ restartedOrgCount }) =>
				restartedOrgCount > 0
					? `Restarted ${restartedOrgCount} host service${restartedOrgCount === 1 ? "" : "s"}`
					: "Setting saved",
			error: (err: Error) => err.message ?? "Failed to update setting",
		});
	};

	const handleChange = (next: boolean) => {
		if (next) {
			setConfirmOpen(true);
		} else {
			runToggle(false);
		}
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Security</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Control how your local machine is reachable from remote workspaces
				</p>
			</div>

			{showRelayToggle && (
				<div className="flex items-start justify-between gap-6">
					<div className="space-y-1 flex-1">
						<Label
							htmlFor="expose-host-service-via-relay"
							className="text-sm font-medium"
						>
							Allow remote workspaces to access this device via relay
						</Label>
						<p className="text-xs text-muted-foreground">
							When off, your local tools and files cannot be reached from any
							remote workspace through the Superset relay. This does not affect
							your ability to connect out to remote sandboxes from this device.
						</p>
					</div>
					<Switch
						id="expose-host-service-via-relay"
						checked={exposeEnabled ?? false}
						onCheckedChange={handleChange}
						disabled={isLoading || setExpose.isPending}
					/>
				</div>
			)}

			<ExposeViaRelayConfirmDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				onConfirm={() => {
					setConfirmOpen(false);
					runToggle(true);
				}}
			/>
		</div>
	);
}
