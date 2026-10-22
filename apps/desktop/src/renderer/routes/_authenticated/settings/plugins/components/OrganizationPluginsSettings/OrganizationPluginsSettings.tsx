import { Trans, useLingui } from "@lingui/react/macro";
import { useIsOrganizationAdmin } from "renderer/hooks/useIsOrganizationAdmin";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { PluginAccessTable } from "./components/PluginAccessTable";
import { PluginSources } from "./components/PluginSources";

interface OrganizationPluginsSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function OrganizationPluginsSettings({
	visibleItems,
}: OrganizationPluginsSettingsProps) {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const isAdmin = useIsOrganizationAdmin();

	const showSources = isItemVisible(
		SETTING_ITEM_ID.ORGANIZATION_PLUGIN_SOURCES,
		visibleItems,
	);
	const showAccess = isItemVisible(
		SETTING_ITEM_ID.ORGANIZATION_PLUGIN_ACCESS,
		visibleItems,
	);

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<HighlightText
						text={t({ message: "Organization plugins" })}
						query={searchQuery}
					/>
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					<Trans>
						Sync plugins from your GitHub repositories and choose who can
						install them.
					</Trans>
				</p>
			</div>

			{isAdmin === false && (
				<p className="rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">
					<Trans>Only organization owners and admins can manage plugins.</Trans>
				</p>
			)}

			{isAdmin === true && (
				<div className="space-y-10">
					{showSources && <PluginSources />}
					{showAccess && <PluginAccessTable />}
				</div>
			)}
		</div>
	);
}
