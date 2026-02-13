export interface TabItem {
	name: string;
	icon: string;
	label: string;
	badge?: number;
	isMenuTrigger?: boolean;
}

export interface MenuAction {
	name: string;
	icon: string;
	label: string;
}

export interface TabBarViewProps {
	tabs: TabItem[];
	menuActions?: MenuAction[];
	selectedTab: string;
	organizationName: string;
	style?: import("react-native").StyleProp<import("react-native").ViewStyle>;
	onTabSelect?: (tab: string) => void;
	onMenuActionPress?: (action: string) => void;
	onSettingsPress?: () => void;
	onSearchPress?: () => void;
	onOrgPress?: () => void;
	onExpandedChange?: (expanded: boolean) => void;
}
