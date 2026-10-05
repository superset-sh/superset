import { Trans, useLingui } from "@lingui/react/macro";
import type { FileAutoSaveMode, FileOpenMode } from "@superset/local-db";
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
import type { FolderTierMap, LinkTierMap } from "renderer/lib/clickPolicy";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { HighlightText } from "../../../components/HighlightText";
import { LinkTierMapper } from "../../../components/LinkTierMapper";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { FolderLinkTierMapper } from "../FolderLinkTierMapper";

interface FilesSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function FilesSettings({ visibleItems }: FilesSettingsProps) {
	const { t } = useLingui();
	const {
		preferences,
		setFileLinks,
		setSidebarFileLinks,
		setFolderLinks,
		setPageLinks,
	} = useV2UserPreferences();

	const searchQuery = useSettingsSearchQuery();
	const utils = electronTrpc.useUtils();
	const showFileOpenMode = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_FILE_OPEN_MODE,
		visibleItems,
	);
	const showFileAutoSave = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_FILE_AUTO_SAVE,
		visibleItems,
	);
	const { data: fileOpenMode, isLoading: isFileOpenModeLoading } =
		electronTrpc.settings.getFileOpenMode.useQuery();
	const setFileOpenMode = electronTrpc.settings.setFileOpenMode.useMutation({
		onMutate: async ({ mode }) => {
			await utils.settings.getFileOpenMode.cancel();
			const previous = utils.settings.getFileOpenMode.getData();
			utils.settings.getFileOpenMode.setData(undefined, mode);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getFileOpenMode.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.settings.getFileOpenMode.invalidate();
		},
	});

	const { data: fileAutoSave, isLoading: isFileAutoSaveLoading } =
		electronTrpc.settings.getFileAutoSave.useQuery();
	const setFileAutoSave = electronTrpc.settings.setFileAutoSave.useMutation({
		onMutate: async ({ mode }) => {
			await utils.settings.getFileAutoSave.cancel();
			const previous = utils.settings.getFileAutoSave.getData();
			utils.settings.getFileAutoSave.setData(undefined, mode);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getFileAutoSave.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.settings.getFileAutoSave.invalidate();
		},
	});

	const showFile = isItemVisible(SETTING_ITEM_ID.LINKS_FILE, visibleItems);
	const showFolder = isItemVisible(SETTING_ITEM_ID.LINKS_FOLDER, visibleItems);
	const showPage = isItemVisible(SETTING_ITEM_ID.LINKS_PAGE, visibleItems);
	const showSidebar = isItemVisible(
		SETTING_ITEM_ID.LINKS_SIDEBAR_FILE,
		visibleItems,
	);

	const handleFileChange = useCallback(
		(next: LinkTierMap) => {
			setFileLinks(next);
			toast.success(t({ message: "Changes saved" }));
		},
		[setFileLinks, t],
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

	const handlePageChange = useCallback(
		(next: LinkTierMap) => {
			setPageLinks(next);
			toast.success(t({ message: "Changes saved" }));
		},
		[setPageLinks, t],
	);

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans>Files &amp; Editor</Trans>
				</h2>
			</div>

			<div className="space-y-8">
				{showFileAutoSave && (
					<section className="space-y-3">
						<h3 className="text-sm font-medium text-muted-foreground">
							<Trans>Editing</Trans>
						</h3>
						<div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
							<div className="space-y-0.5">
								<Label htmlFor="file-auto-save" className="text-sm font-medium">
									<HighlightText
										text={t({ message: "Auto Save" })}
										query={searchQuery}
									/>
								</Label>
								<p className="text-xs text-muted-foreground">
									<Trans>Controls when manually edited files are saved</Trans>
								</p>
							</div>
							<Select
								value={fileAutoSave ?? "off"}
								onValueChange={(value) =>
									setFileAutoSave.mutate({ mode: value as FileAutoSaveMode })
								}
								disabled={isFileAutoSaveLoading || setFileAutoSave.isPending}
							>
								<SelectTrigger id="file-auto-save" className="w-[180px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="off">
										<Trans>Off</Trans>
									</SelectItem>
									<SelectItem value="afterDelay">
										<Trans>After delay (3s)</Trans>
									</SelectItem>
									<SelectItem value="onFocusChange">
										<Trans>On focus change</Trans>
									</SelectItem>
									<SelectItem value="onWindowChange">
										<Trans>On window change</Trans>
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</section>
				)}
				{(showFileOpenMode || showSidebar || showFile) && (
					<section className="space-y-6">
						<h3 className="text-sm font-medium text-muted-foreground">
							<Trans>Opening files</Trans>
						</h3>
						{showFileOpenMode && (
							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<Label
										htmlFor="file-open-mode"
										className="text-sm font-medium"
									>
										<HighlightText
											text={t({
												message: "File open mode",
											})}
											query={searchQuery}
										/>
									</Label>
									<p className="text-xs text-muted-foreground">
										<Trans>
											Choose how files open when no preview pane exists
										</Trans>
									</p>
								</div>
								<Select
									value={fileOpenMode ?? "split-pane"}
									onValueChange={(value) =>
										setFileOpenMode.mutate({ mode: value as FileOpenMode })
									}
									disabled={isFileOpenModeLoading || setFileOpenMode.isPending}
								>
									<SelectTrigger id="file-open-mode" className="w-[180px]">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="split-pane">
											<Trans>Split pane</Trans>
										</SelectItem>
										<SelectItem value="new-tab">
											<Trans>New tab</Trans>
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
						)}
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
					</section>
				)}
				{showFolder && (
					<section className="space-y-3">
						<h3 className="text-sm font-medium text-muted-foreground">
							<Trans>Opening folders</Trans>
						</h3>
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
					</section>
				)}
				{showPage && (
					<section className="space-y-3">
						<h3 className="text-sm font-medium text-muted-foreground">
							<Trans>Opening pages</Trans>
						</h3>
						<LinkTierMapper
							title={t({
								message: "Page links",
							})}
							description={t({
								message:
									"Applies to the Pages menu and page links in terminals, chat, and other pages.",
							})}
							value={preferences.pageLinks}
							onChange={handlePageChange}
							idPrefix="links-page"
							surface="url"
						/>
					</section>
				)}
			</div>
		</div>
	);
}
