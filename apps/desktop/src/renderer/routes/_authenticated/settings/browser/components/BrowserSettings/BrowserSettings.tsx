import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useEffect, useState } from "react";
import { TbDownload } from "react-icons/tb";
import { ImportHistoryDialog } from "renderer/components/ImportHistoryDialog";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

import { BrowserLinkSettings } from "./components/BrowserLinkSettings";

interface BrowserSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function BrowserSettings({ visibleItems }: BrowserSettingsProps) {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const [isImportOpen, setIsImportOpen] = useState(false);

	const showOpenLinksInApp = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_OPEN_LINKS_IN_APP,
		visibleItems,
	);
	const showHomepage = isItemVisible(
		SETTING_ITEM_ID.BROWSER_HOMEPAGE,
		visibleItems,
	);
	const showImportHistory = isItemVisible(
		SETTING_ITEM_ID.BROWSER_IMPORT_HISTORY,
		visibleItems,
	);

	const utils = electronTrpc.useUtils();
	const { data: homepageUrl, isLoading: isHomepageLoading } =
		electronTrpc.settings.getBrowserHomepageUrl.useQuery();
	const setHomepageUrl =
		electronTrpc.settings.setBrowserHomepageUrl.useMutation({
			onSettled: () => {
				utils.settings.getBrowserHomepageUrl.invalidate();
			},
		});

	const { data: openLinksInApp, isLoading: isOpenLinksInAppLoading } =
		electronTrpc.settings.getOpenLinksInApp.useQuery();
	const setOpenLinksInApp = electronTrpc.settings.setOpenLinksInApp.useMutation(
		{
			onMutate: async ({ enabled }) => {
				await utils.settings.getOpenLinksInApp.cancel();
				const previous = utils.settings.getOpenLinksInApp.getData();
				utils.settings.getOpenLinksInApp.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getOpenLinksInApp.setData(undefined, context.previous);
				}
			},
			onSettled: () => {
				utils.settings.getOpenLinksInApp.invalidate();
			},
		},
	);

	// Local draft so the field stays editable while the query/mutation settle.
	const [draft, setDraft] = useState("");
	useEffect(() => {
		setDraft(homepageUrl ?? "");
	}, [homepageUrl]);

	const commitHomepage = () => {
		const next = draft.trim();
		if (next === (homepageUrl ?? "")) return;
		setHomepageUrl.mutate({ url: next.length > 0 ? next : null });
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans>Browser</Trans>
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					<Trans>Configure the in-app browser</Trans>
				</p>
			</div>

			<div className="space-y-6">
				{showOpenLinksInApp && (
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label
								htmlFor="open-links-in-app"
								className="text-sm font-medium"
							>
								<HighlightText
									text={t({
										message: "Open links in the in-app browser",
									})}
									query={searchQuery}
								/>
							</Label>
							<p className="text-xs text-muted-foreground">
								<Trans>
									Open links from chat and terminal in the in-app browser
									instead of your default browser
								</Trans>
							</p>
						</div>
						<Switch
							id="open-links-in-app"
							checked={openLinksInApp ?? false}
							onCheckedChange={(enabled) =>
								setOpenLinksInApp.mutate({ enabled })
							}
							disabled={isOpenLinksInAppLoading || setOpenLinksInApp.isPending}
						/>
					</div>
				)}

				{showHomepage && (
					<div className="flex items-center justify-between gap-4">
						<div className="space-y-0.5">
							<Label htmlFor="browser-homepage" className="text-sm font-medium">
								<HighlightText
									text={t({
										message: "Browser homepage",
									})}
									query={searchQuery}
								/>
							</Label>
							<p className="text-xs text-muted-foreground">
								<Trans>
									The page new in-app browser tabs open to. Leave empty for a
									blank page.
								</Trans>
							</p>
						</div>
						<Input
							id="browser-homepage"
							className="w-[260px]"
							placeholder="about:blank"
							value={draft}
							disabled={isHomepageLoading}
							onChange={(event) => setDraft(event.target.value)}
							onBlur={commitHomepage}
							onKeyDown={(event) => {
								if (event.key === "Enter") event.currentTarget.blur();
							}}
						/>
					</div>
				)}

				{showImportHistory && (
					<div className="flex items-center justify-between gap-4">
						<div className="space-y-0.5">
							<Label className="text-sm font-medium">
								<HighlightText
									text={t({
										message: "Import settings from another browser",
									})}
									query={searchQuery}
								/>
							</Label>
							<p className="text-xs text-muted-foreground">
								<Trans>
									Copy browsing history and logins from Chrome, Brave, Arc, or
									another Chromium browser into Superset.
								</Trans>
							</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							className="gap-2 shrink-0"
							onClick={() => setIsImportOpen(true)}
						>
							<TbDownload className="size-4" />
							<Trans>Import…</Trans>
						</Button>
					</div>
				)}
				{[SETTING_ITEM_ID.LINKS_URL, SETTING_ITEM_ID.LINKS_PORT].some((id) =>
					isItemVisible(id, visibleItems),
				) && <BrowserLinkSettings visibleItems={visibleItems} />}
			</div>

			<ImportHistoryDialog open={isImportOpen} onOpenChange={setIsImportOpen} />
		</div>
	);
}
