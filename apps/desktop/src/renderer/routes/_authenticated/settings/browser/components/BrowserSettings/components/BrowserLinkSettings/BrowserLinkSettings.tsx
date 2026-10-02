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
	type LinkAction,
	type LinkTierMap,
} from "renderer/lib/clickPolicy";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { LinkTierMapper } from "../../../../../components/LinkTierMapper";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../../../utils/settings-search";

const PORT_ACTIONS: LinkAction[] = ["pane", "newTab", "external"];

interface BrowserLinkSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function BrowserLinkSettings({
	visibleItems,
}: BrowserLinkSettingsProps) {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const { preferences, setUrlLinks, setPortOpenAction } =
		useV2UserPreferences();
	const showUrl = isItemVisible(SETTING_ITEM_ID.LINKS_URL, visibleItems);
	const showPort = isItemVisible(SETTING_ITEM_ID.LINKS_PORT, visibleItems);

	const handleUrlChange = useCallback(
		(next: LinkTierMap) => {
			setUrlLinks(next);
			toast.success(t({ message: "Changes saved" }));
		},
		[setUrlLinks, t],
	);

	const handlePortChange = useCallback(
		(next: LinkAction) => {
			setPortOpenAction(next);
			toast.success(t({ message: "Changes saved" }));
		},
		[setPortOpenAction, t],
	);

	return (
		<>
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
			{showPort && (
				<div className="rounded-lg border border-border overflow-hidden">
					<div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
						<div className="min-w-0 flex-1 basis-64 space-y-1">
							<Label
								htmlFor="links-port-action"
								className="text-sm font-medium"
							>
								<HighlightText
									text={t({ message: "Ports" })}
									query={searchQuery}
								/>
							</Label>
							<p className="text-xs text-muted-foreground">
								<Trans>
									Where detected-port badges in the sidebar open when clicked.
								</Trans>
							</p>
						</div>
						<Select
							value={preferences.portOpenAction}
							onValueChange={(v) => handlePortChange(v as LinkAction)}
						>
							<SelectTrigger
								id="links-port-action"
								size="sm"
								className="w-60 max-w-full shrink-0"
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
		</>
	);
}
