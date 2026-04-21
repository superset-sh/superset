import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import type { LinkTierMap } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { LinkTierMapper } from "../LinkTierMapper";

interface LinksSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function LinksSettings({ visibleItems }: LinksSettingsProps) {
	const { preferences, setFileLinks, setUrlLinks } = useV2UserPreferences();

	const showFile = isItemVisible(SETTING_ITEM_ID.LINKS_FILE, visibleItems);
	const showUrl = isItemVisible(SETTING_ITEM_ID.LINKS_URL, visibleItems);

	const handleFileChange = useCallback(
		(next: LinkTierMap) => {
			setFileLinks(next);
			toast.success("Changes saved");
		},
		[setFileLinks],
	);

	const handleUrlChange = useCallback(
		(next: LinkTierMap) => {
			setUrlLinks(next);
			toast.success("Changes saved");
		},
		[setUrlLinks],
	);

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Links</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Control how file paths and URLs open when clicked in terminals, chat,
					and tasks. ⌘⇧-click only applies in the terminal.
				</p>
			</div>

			<div className="space-y-6">
				{showFile && (
					<LinkTierMapper
						title="File links"
						description="Applies to file paths in terminals, chat tool calls, and task markdown."
						value={preferences.fileLinks}
						onChange={handleFileChange}
						idPrefix="links-file"
						actionLabels={{
							pane: "File viewer",
							external: "External editor",
						}}
					/>
				)}

				{showUrl && (
					<LinkTierMapper
						title="URL links"
						description="Applies to URLs in terminals, chat messages, and task markdown."
						value={preferences.urlLinks}
						onChange={handleUrlChange}
						idPrefix="links-url"
						actionLabels={{
							pane: "In-app browser",
							external: "Browser",
						}}
					/>
				)}
			</div>
		</div>
	);
}
