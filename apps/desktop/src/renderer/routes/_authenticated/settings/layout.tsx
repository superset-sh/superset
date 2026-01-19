import {
	createFileRoute,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type SettingsSection,
	useSettingsSearchQuery,
} from "renderer/stores/settings-state";
import { SettingsSidebar } from "./components/SettingsSidebar";
import { getMatchCountBySection } from "./utils/settings-search";

export const Route = createFileRoute("/_authenticated/settings")({
	component: SettingsLayout,
});

// Order of sections for auto-navigation
const SECTION_ORDER: SettingsSection[] = [
	"account",
	"organization",
	"members",
	"appearance",
	"ringtones",
	"keyboard",
	"behavior",
	"terminal",
];

// Map route paths to section names
function getSectionFromPath(pathname: string): SettingsSection | null {
	if (pathname.includes("/settings/account")) return "account";
	if (pathname.includes("/settings/organization")) return "organization";
	if (pathname.includes("/settings/members")) return "members";
	if (pathname.includes("/settings/appearance")) return "appearance";
	if (pathname.includes("/settings/ringtones")) return "ringtones";
	if (pathname.includes("/settings/keyboard")) return "keyboard";
	if (pathname.includes("/settings/behavior")) return "behavior";
	if (pathname.includes("/settings/terminal")) return "terminal";
	if (pathname.includes("/settings/project")) return "project";
	if (pathname.includes("/settings/workspace")) return "workspace";
	return null;
}

// Map section names to route paths
function getPathFromSection(section: SettingsSection): string {
	switch (section) {
		case "account":
			return "/settings/account";
		case "organization":
			return "/settings/organization";
		case "members":
			return "/settings/members";
		case "appearance":
			return "/settings/appearance";
		case "ringtones":
			return "/settings/ringtones";
		case "keyboard":
			return "/settings/keyboard";
		case "behavior":
			return "/settings/behavior";
		case "terminal":
			return "/settings/terminal";
		default:
			return "/settings/account";
	}
}

function SettingsLayout() {
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const searchQuery = useSettingsSearchQuery();
	const location = useLocation();
	const navigate = useNavigate();

	// Auto-navigate to first matching section when search filters out current section
	useEffect(() => {
		if (!searchQuery) return;

		const currentSection = getSectionFromPath(location.pathname);
		if (!currentSection) return;

		// Don't auto-navigate from project/workspace pages
		if (currentSection === "project" || currentSection === "workspace") return;

		const matchCounts = getMatchCountBySection(searchQuery);
		const currentHasMatches = (matchCounts[currentSection] ?? 0) > 0;

		if (!currentHasMatches) {
			// Find first section with matches
			const firstMatch = SECTION_ORDER.find(
				(section) => (matchCounts[section] ?? 0) > 0,
			);
			if (firstMatch) {
				navigate({ to: getPathFromSection(firstMatch) });
			}
		}
	}, [searchQuery, location.pathname, navigate]);

	return (
		<div className="flex flex-col h-screen w-screen bg-tertiary">
			{/* Top bar with Mac spacing - invisible but reserves space */}
			<div
				className="drag h-8 w-full bg-tertiary"
				style={{
					paddingLeft: isMac ? "88px" : "16px",
				}}
			/>

			{/* Main content */}
			<div className="flex flex-1 overflow-hidden">
				<SettingsSidebar />
				<div className="flex-1 m-3 bg-background rounded overflow-auto">
					<Outlet />
				</div>
			</div>
		</div>
	);
}
