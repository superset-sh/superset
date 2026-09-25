import { Trans } from "@lingui/react/macro";
import { ExposeViaRelaySection } from "renderer/routes/_authenticated/settings/components/ExposeViaRelaySection";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

interface SecuritySettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function SecuritySettings({ visibleItems }: SecuritySettingsProps) {
	const showRelayToggle = isItemVisible(
		SETTING_ITEM_ID.SECURITY_EXPOSE_HOST_SERVICE_VIA_RELAY,
		visibleItems,
	);

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans>Remote Access</Trans>
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					<Trans>
						Control how your local machine is reachable from elsewhere
					</Trans>
				</p>
			</div>

			{showRelayToggle && <ExposeViaRelaySection />}
		</div>
	);
}
