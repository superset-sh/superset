import {
	createFileRoute,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type SettingsSection,
	useSetSettingsSearchQuery,
	useSettingsOriginRoute,
	useSettingsSearchQuery,
} from "renderer/stores/settings-state";
import { SearchResultsBanner } from "./components/SearchResultsBanner";
import { SettingsSidebar } from "./components/SettingsSidebar";
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
	"keyboard",
	"behavior",
	"git",
	"terminal",
	"models",
	"organization",
	"integrations",
	"billing",
	"apikeys",
	"permissions",
];

function getSectionFromPath(pathname: string): SettingsSection | null {
	if (pathname.includes("/settings/account")) return "account";
	if (pathname.includes("/settings/organization")) return "organization";
	if (pathname.includes("/settings/appearance")) return "appearance";
	if (pathname.includes("/settings/ringtones")) return "ringtones";
	if (pathname.includes("/settings/keyboard")) return "keyboard";
	if (pathname.includes("/settings/behavior")) return "behavior";
	if (pathname.includes("/settings/git")) return "git";
	if (pathname.includes("/settings/terminal")) return "terminal";
	if (pathname.includes("/settings/models")) return "models";
	if (pathname.includes("/settings/integrations")) return "integrations";
	if (pathname.includes("/settings/permissions")) return "permissions";
	if (pathname.includes("/settings/project")) return "project";
	return null;
}

function getPathFromSection(section: SettingsSection): string {
	switch (section) {
		case "account":
			return "/settings/account";
		case "organization":
			return "/settings/organization";
		case "appearance":
			return "/settings/appearance";
		case "ringtones":
			return "/settings/ringtones";
		case "keyboard":
			return "/settings/keyboard";
		case "behavior":
			return "/settings/behavior";
		case "git":
			return "/settings/git";
		case "terminal":
			return "/settings/terminal";
		case "models":
			return "/settings/models";
		case "integrations":
			return "/settings/integrations";
		case "permissions":
			return "/settings/permissions";
		default:
			return "/settings/account";
	}
}

function SettingsLayout() {
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const searchQuery = useSettingsSearchQuery();
	const setSearchQuery = useSetSettingsSearchQuery();
	const originRoute = useSettingsOriginRoute();
	const location = useLocation();
	const navigate = useNavigate();
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
			event.preventDefault();
			navigate({ to: originRoute });
		},
		{ enableOnFormTags: false, enableOnContentEditable: false },
		[navigate, originRoute],
	);

	return (
		<div className="flex flex-col h-screen w-screen bg-tertiary">
			<div
				className="drag h-8 w-full bg-tertiary"
				style={{
					paddingLeft: isMac ? "88px" : "16px",
				}}
			/>

			<div className="flex flex-1 overflow-hidden">
				<SettingsSidebar />
				<div className="flex-1 m-3 bg-background rounded overflow-auto">
					{isSearchActive && (
						<SearchResultsBanner
							query={normalizedSearchQuery}
							matchCount={totalMatches}
							onClear={() => setSearchQuery("")}
						/>
					)}
					<Outlet />
				</div>
			</div>
		</div>
	);
}
