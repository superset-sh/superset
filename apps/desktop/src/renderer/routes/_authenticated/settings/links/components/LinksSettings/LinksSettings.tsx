import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import {
	actionLabel,
	type FolderTierMap,
	type LinkAction,
	type LinkTierMap,
} from "renderer/lib/clickPolicy";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { FolderLinkTierMapper } from "../FolderLinkTierMapper";
import { LinkTierMapper } from "../LinkTierMapper";

const PORT_ACTIONS: LinkAction[] = ["pane", "newTab", "external"];

interface LinksSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function LinksSettings({ visibleItems }: LinksSettingsProps) {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const {
		preferences,
		setFileLinks,
		setUrlLinks,
		setSidebarFileLinks,
		setFolderLinks,
		setPortOpenAction,
	} = useV2UserPreferences();

	const showFile = isItemVisible(SETTING_ITEM_ID.LINKS_FILE, visibleItems);
	const showFolder = isItemVisible(SETTING_ITEM_ID.LINKS_FOLDER, visibleItems);
	const showUrl = isItemVisible(SETTING_ITEM_ID.LINKS_URL, visibleItems);
	const showSidebar = isItemVisible(
		SETTING_ITEM_ID.LINKS_SIDEBAR_FILE,
		visibleItems,
	);
	const showPort = isItemVisible(SETTING_ITEM_ID.LINKS_PORT, visibleItems);

	const handleFileChange = useCallback(
		(next: LinkTierMap) => {
			setFileLinks(next);
			toast.success(t({ message: "Changes saved" }));
		},
		[setFileLinks, t],
	);

	const handleUrlChange = useCallback(
		(next: LinkTierMap) => {
			setUrlLinks(next);
			toast.success(t({ message: "Changes saved" }));
		},
		[setUrlLinks, t],
	);

	const handleFolderChange = useCallback(
		(next: FolderTierMap) => {
			setFolderLinks(next);
			toast.success(t({ message: "Changes saved" }));
		},
		[setFolderLinks, t],
	);

	const handleSidebarChange = useCallback(
		(next: LinkTierMap) => {
			setSidebarFileLinks(next);
			toast.success(t({ message: "Changes saved" }));
		},
		[setSidebarFileLinks, t],
	);

	const handlePortChange = useCallback(
		(next: LinkAction) => {
			setPortOpenAction(next);
			toast.success(t({ message: "Changes saved" }));
		},
		[setPortOpenAction, t],
	);

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans>Links</Trans>
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					<Trans>
						Control what each click — plain or with a modifier — does to a file
						or URL. Each row binds one modifier combination to an action.
					</Trans>
				</p>
			</div>

			<div className="space-y-6">
				{showSidebar && (
					<LinkTierMapper
						title={t({
							message: "Sidebar file rows",
						})}
						description={t({
							message:
								"Applies to the file tree, changes list, and diff header.",
						})}
						value={preferences.sidebarFileLinks}
						onChange={handleSidebarChange}
						idPrefix="links-sidebar-file"
						surface="file"
					/>
				)}

				{showPort && (
					<div>
						<h3 className="text-sm font-medium mb-1">
							<HighlightText
								text={t({ message: "Ports" })}
								query={searchQuery}
							/>
						</h3>
						<p className="text-xs text-muted-foreground mb-3">
							<Trans>
								Where detected-port badges in the sidebar open when clicked.
							</Trans>
						</p>
						<div className="flex items-center justify-between gap-4">
							<Label
								htmlFor="links-port-action"
								className="text-sm font-medium"
							>
								<Trans>On click</Trans>
							</Label>
							<Select
								value={preferences.portOpenAction}
								onValueChange={(v) => handlePortChange(v as LinkAction)}
							>
								<SelectTrigger
									id="links-port-action"
									size="sm"
									className="w-44"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PORT_ACTIONS.map((action) => (
										<SelectItem key={action} value={action}>
											{actionLabel(action, "url")}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				)}

				{showFile && (
					<LinkTierMapper
						title={t({
							message: "File links",
						})}
						description={t({
							message:
								"Applies to file paths in terminals, chat tool calls, and task markdown.",
						})}
						value={preferences.fileLinks}
						onChange={handleFileChange}
						idPrefix="links-file"
						surface="file"
					/>
				)}

				{showFolder && (
					<FolderLinkTierMapper
						title={t({
							message: "Folder links",
						})}
						description={t({
							message:
								"Applies to folder paths in terminal output. Folders can't open in the file viewer, so clicks reveal in the sidebar, open the external editor, or open Finder.",
						})}
						value={preferences.folderLinks}
						onChange={handleFolderChange}
						idPrefix="links-folder"
					/>
				)}

				{showUrl && (
					<LinkTierMapper
						title={t({
							message: "URL links",
						})}
						description={t({
							message:
								"Applies to URLs in terminals, chat messages, and task browsers.",
						})}
						value={preferences.urlLinks}
						onChange={handleUrlChange}
						idPrefix="links-url"
						surface="url"
					/>
				)}
			</div>
		</div>
	);
}
