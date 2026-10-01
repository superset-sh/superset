import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY, FEATURE_FLAGS } from "@superset/shared/constants";
import { Link } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import {
	HiArrowLeft,
	HiArrowTopRightOnSquare,
	HiMagnifyingGlass,
	HiXMark,
} from "react-icons/hi2";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AppMenuButton } from "renderer/routes/_authenticated/_dashboard/components/AppMenuButton";
import { NavigationControls } from "renderer/routes/_authenticated/_dashboard/components/NavigationControls";
import {
	WINDOW_CONTROLS_ROW_HEIGHT,
	WINDOW_CONTROLS_ROW_TOP,
} from "renderer/routes/_authenticated/_dashboard/components/WindowChrome";
import {
	useSetSettingsSearchQuery,
	useSettingsOriginRoute,
	useSettingsSearchQuery,
} from "renderer/stores/settings-state";
import { COLLAPSED_WORKSPACE_SIDEBAR_WIDTH } from "renderer/stores/workspace-sidebar-state";
import { getVisibleMatchCountBySection } from "../../utils/settings-search";
import { GeneralSettings } from "./GeneralSettings";

export function SettingsSidebar() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const setSearchQuery = useSetSettingsSearchQuery();
	const originRoute = useSettingsOriginRoute();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const mobileEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.MOBILE_LAUNCH) === true;
	const cloudWorkspacesEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES) === true;
	const normalizedSearchQuery = searchQuery.trim();
	const matchCounts = normalizedSearchQuery
		? getVisibleMatchCountBySection(
				normalizedSearchQuery,
				isV2CloudEnabled,
				cloudWorkspacesEnabled,
				mobileEnabled,
			)
		: null;

	return (
		<div className="w-56 flex flex-col pb-3 overflow-hidden border-r border-border bg-sidebar dark:bg-muted/35">
			<div className="mb-1 flex h-12 shrink-0 items-center">
				{isMac ? (
					<div className="drag h-full shrink-0" style={{ width: 96 }} />
				) : (
					<div
						className="flex shrink-0 items-center justify-center self-start"
						style={{
							width: COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
							marginTop: WINDOW_CONTROLS_ROW_TOP,
							height: WINDOW_CONTROLS_ROW_HEIGHT,
						}}
					>
						<AppMenuButton />
					</div>
				)}
				<div
					className="flex shrink-0 items-center self-start"
					style={{
						marginTop: WINDOW_CONTROLS_ROW_TOP,
						height: WINDOW_CONTROLS_ROW_HEIGHT,
					}}
				>
					<NavigationControls />
				</div>
				<div className="drag h-full min-w-0 flex-1" />
			</div>
			{/* Back button */}
			<Link
				to={originRoute}
				className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-1"
			>
				<HiArrowLeft className="h-4 w-4" />
				<span>
					<Trans>Back</Trans>
				</span>
			</Link>

			{/* Settings title */}
			<h1 className="text-lg font-semibold px-3 mb-4">
				<Trans>Settings</Trans>
			</h1>

			{/* Search input */}
			<div className="relative px-3 mb-4">
				<HiMagnifyingGlass className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
				<input
					type="text"
					placeholder={t({
						message: "Search settings...",
					})}
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					className="w-full h-8 pl-8 pr-8 text-sm bg-accent/50 rounded-md border-0 outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
				/>
				{searchQuery && (
					<button
						type="button"
						onClick={() => setSearchQuery("")}
						className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
					>
						<HiXMark className="h-4 w-4" />
					</button>
				)}
			</div>

			<div className="flex-1 overflow-y-auto min-h-0 border-t border-border pt-4 pb-4 px-3">
				<GeneralSettings matchCounts={matchCounts} />
			</div>

			<div className="pt-3 border-t border-border px-3">
				<a
					href={COMPANY.DOCS_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground transition-colors"
				>
					<HiArrowTopRightOnSquare className="h-4 w-4" />
					<span>
						<Trans>Documentation</Trans>
					</span>
				</a>
			</div>
		</div>
	);
}
