import {
	createFileRoute,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { CheckResourcesHotkeyMount } from "renderer/commandPalette";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type SettingsSection,
	useSetSettingsSearchQuery,
	useSettingsOriginRoute,
	useSettingsSearchQuery,
} from "renderer/stores/settings-state";
import { NavigationControls } from "../_dashboard/components/NavigationControls";
import { SearchResultsBanner } from "./components/SearchResultsBanner";
import {
	FULL_WIDTH_SECTION_PATHS,
	SettingsSidebar,
} from "./components/SettingsSidebar";
import { useScrollReset } from "./hooks/useScrollReset";
import {
	getMatchCountBySection,
	searchSettings,
} from "./utils/settings-search";

export const Route = createFileRoute("/_authenticated/settings")({
	component: SettingsLayout,
});

const SECTION_ORDER: SettingsSection[] = [
	"account",
	"appearance",
	"ringtones",
	"usage",
	"keyboard",
	"behavior",
	"git",
	"agents",
	"terminal",
	"links",
	"browser",
	"models",
	"organization",
	"teams",
	"project",
	"integrations",
	"billing",
	"apikeys",
	"security",
	"permissions",
	"hosts",
	"experimental",
];

/**
 * Single source of truth for section <-> path, read in both directions by
 * getSectionFromPath/getPathFromSection below instead of two independently
 * hand-maintained lookups that can drift out of sync with each other.
 */
const SECTION_PATHS: Partial<Record<SettingsSection, string>> = {
	account: "/settings/account",
	organization: "/settings/organization",
	teams: "/settings/teams",
	appearance: "/settings/appearance",
	ringtones: "/settings/ringtones",
	usage: "/settings/usage",
	keyboard: "/settings/keyboard",
	behavior: "/settings/behavior",
	git: "/settings/git",
	agents: "/settings/agents",
	terminal: "/settings/terminal",
	links: "/settings/links",
	browser: "/settings/browser",
	models: "/settings/models",
	experimental: "/settings/experimental",
	integrations: "/settings/integrations",
	billing: "/settings/billing",
	apikeys: "/settings/api-keys",
	security: "/settings/security",
	permissions: "/settings/permissions",
	hosts: "/settings/hosts",
	project: "/settings/projects",
};

function getSectionFromPath(pathname: string): SettingsSection | null {
	const match = Object.entries(SECTION_PATHS).find(([, path]) =>
		pathname.includes(path),
	);
	return match ? (match[0] as SettingsSection) : null;
}

function getPathFromSection(section: SettingsSection): string {
	return SECTION_PATHS[section] ?? "/settings/account";
}

/**
 * Sections whose drilldown routes (a param segment with no index route of
 * its own) would 404 if the Escape handler below popped just one path
 * segment — going up from those lands on /settings/usage instead.
 */
const NON_ROUTABLE_ESCAPE_PARENTS = new Set([
	"/settings/usage/model",
	"/settings/usage/workspace",
]);

function SettingsLayout() {
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const searchQuery = useSettingsSearchQuery();
	const setSearchQuery = useSetSettingsSearchQuery();
	const originRoute = useSettingsOriginRoute();
	const location = useLocation();
	const navigate = useNavigate();
	// Reset scroll to top when navigating to a different settings page.
	const contentRef = useScrollReset<HTMLDivElement>(location.pathname);
	const normalizedSearchQuery = searchQuery.trim();
	const isSearchActive = normalizedSearchQuery.length > 0;
	const totalMatches = isSearchActive
		? searchSettings(normalizedSearchQuery).length
		: 0;

	useEffect(() => {
		if (!isSearchActive) return;

		const currentSection = getSectionFromPath(location.pathname);
		if (!currentSection) return;

		if (currentSection === "project") return;
		if (currentSection === "hosts") return;
		if (currentSection === "usage") return;

		const matchCounts = getMatchCountBySection(normalizedSearchQuery);
		const currentHasMatches = (matchCounts[currentSection] ?? 0) > 0;

		if (!currentHasMatches) {
			const firstMatch = SECTION_ORDER.find(
				(section) => (matchCounts[section] ?? 0) > 0,
			);
			if (firstMatch) {
				navigate({ to: getPathFromSection(firstMatch), replace: true });
			}
		}
	}, [isSearchActive, location.pathname, navigate, normalizedSearchQuery]);

	useHotkeys(
		"escape",
		(event) => {
			if (document.querySelector('[data-state="open"]')) return;
			const segments = location.pathname.split("/").filter(Boolean);
			event.preventDefault();
			if (segments.length <= 2) {
				navigate({ to: originRoute });
				return;
			}

			const parent = `/${segments.slice(0, -1).join("/")}`;
			navigate({
				to: NON_ROUTABLE_ESCAPE_PARENTS.has(parent)
					? "/settings/usage"
					: parent,
			});
		},
		{ enableOnFormTags: false, enableOnContentEditable: false },
		[navigate, location.pathname, originRoute],
	);

	const usesFullWidthContent = FULL_WIDTH_SECTION_PATHS.some((path) =>
		location.pathname.startsWith(path),
	);

	return (
		<div className="flex flex-col h-screen w-screen bg-background">
			{/* CommandPaletteHost (Cmd/Ctrl+K etc.) only mounts inside the
			    _dashboard route tree; CHECK_RESOURCES needs its own mount here so
			    the hotkey and native "Resources" menu item still work in Settings. */}
			<CheckResourcesHotkeyMount />
			<div className="flex h-12 w-full items-center bg-sidebar dark:bg-muted/35">
				<div
					className="drag h-full shrink-0"
					style={{ width: isMac ? "96px" : "8px" }}
				/>
				<NavigationControls />
				<div className="drag h-full min-w-0 flex-1" />
			</div>

			<div className="flex flex-1 overflow-hidden bg-background">
				<SettingsSidebar />
				<div ref={contentRef} className="flex-1 overflow-auto">
					{isSearchActive && (
						<SearchResultsBanner
							query={normalizedSearchQuery}
							matchCount={totalMatches}
							onClear={() => setSearchQuery("")}
						/>
					)}
					{usesFullWidthContent ? (
						<Outlet />
					) : (
						<div className="mx-auto max-w-4xl">
							<Outlet />
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
