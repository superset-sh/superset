import type { TabItem } from "@superset/tab-bar";
import { TabBarView } from "@superset/tab-bar";
import { useRouter } from "expo-router";
import { useTabTrigger } from "expo-router/ui";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";

const TABS: TabItem[] = [
	{ name: "(home)", icon: "house.fill", label: "Home" },
	{ name: "(tasks)", icon: "checkmark.square.fill", label: "Tasks" },
	{ name: "__menu__", icon: "ellipsis", label: "More", isMenuTrigger: true },
];

const NAVIGABLE_TAB_NAMES = ["(home)", "(tasks)"];

const MENU_ACTIONS = [
	{ name: "views", icon: "square.stack", label: "Views" },
	{ name: "customize", icon: "ellipsis", label: "Customize" },
];

const COLLAPSE_ANIMATION_MS = 400;

export function AuthenticatedTabBar() {
	const router = useRouter();
	const { activeOrganization } = useOrganizations();
	const { switchTab, getTrigger } = useTabTrigger({ name: "(home)" });
	const [isExpanded, setIsExpanded] = useState(false);
	const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const activeTab =
		NAVIGABLE_TAB_NAMES.find((name) => getTrigger(name)?.isFocused) ?? "(home)";

	const handleExpandedChange = useCallback((expanded: boolean) => {
		if (expanded) {
			// Expand container immediately so SwiftUI has room to animate into
			if (collapseTimer.current) {
				clearTimeout(collapseTimer.current);
				collapseTimer.current = null;
			}
			setIsExpanded(true);
		} else {
			// Delay container shrink so the SwiftUI close animation isn't clipped
			collapseTimer.current = setTimeout(() => {
				setIsExpanded(false);
				collapseTimer.current = null;
			}, COLLAPSE_ANIMATION_MS);
		}
	}, []);

	return (
		<View
			style={isExpanded ? styles.containerExpanded : styles.containerCollapsed}
			pointerEvents="box-none"
		>
			<TabBarView
				style={styles.tabBar}
				tabs={TABS}
				menuActions={MENU_ACTIONS}
				selectedTab={activeTab}
				organizationName={activeOrganization?.name ?? "Organization"}
				onTabSelect={(tab: string) => {
					switchTab(tab, { resetOnFocus: false });
				}}
				onMenuActionPress={() => {
					// placeholder — future navigation
				}}
				onSettingsPress={() => {
					router.push("/(authenticated)/(more)/settings");
				}}
				onSearchPress={() => {
					// future
				}}
				onOrgPress={() => {
					switchTab("(more)", { resetOnFocus: false });
				}}
				onExpandedChange={handleExpandedChange}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	containerCollapsed: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		height: 96,
	},
	containerExpanded: {
		position: "absolute",
		top: 0,
		bottom: 0,
		left: 0,
		right: 0,
	},
	tabBar: {
		flex: 1,
	},
});
