import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
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
	const { isV2CloudEnabled, isRemoteV2Enabled } = useIsV2CloudEnabled();
	const setForceV1 = useV2LocalOverrideStore((state) => state.setForceV1);

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
			</div>
		</div>
	);
}
