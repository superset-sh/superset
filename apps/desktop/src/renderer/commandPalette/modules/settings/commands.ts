import {
	BeakerIcon,
	BellIcon,
	BookmarkIcon,
	BuildingIcon,
	CpuIcon,
	CreditCardIcon,
	FileTextIcon,
	FolderIcon,
	GitBranchIcon,
	KeyboardIcon,
	KeyRoundIcon,
	LinkIcon,
	type LucideIcon,
	PaletteIcon,
	ServerIcon,
	ShieldIcon,
	SlidersIcon,
	TerminalIcon,
	UserIcon,
	UsersIcon,
	WrenchIcon,
} from "lucide-react";
import type { Command } from "../../core/types";

interface SettingsTab {
	id: string;
	title: string;
	path: string;
	icon: LucideIcon;
	keywords?: string[];
}

const TABS: SettingsTab[] = [
	{
		id: "account",
		title: "Account",
		path: "/settings/account",
		icon: UserIcon,
	},
	{
		id: "appearance",
		title: "Appearance",
		path: "/settings/appearance",
		icon: PaletteIcon,
		keywords: ["theme", "color"],
	},
	{
		id: "behavior",
		title: "Behavior",
		path: "/settings/behavior",
		icon: SlidersIcon,
	},
	{
		id: "models",
		title: "Models",
		path: "/settings/models",
		icon: CpuIcon,
		keywords: ["ai", "llm"],
	},
	{
		id: "terminal",
		title: "Terminal",
		path: "/settings/terminal",
		icon: TerminalIcon,
	},
	{ id: "git", title: "Git", path: "/settings/git", icon: GitBranchIcon },
	{
		id: "experimental",
		title: "Experimental",
		path: "/settings/experimental",
		icon: BeakerIcon,
	},
	{
		id: "integrations",
		title: "Integrations",
		path: "/settings/integrations",
		icon: LinkIcon,
	},
	{
		id: "organization",
		title: "Organization",
		path: "/settings/organization",
		icon: BuildingIcon,
	},
	{ id: "teams", title: "Teams", path: "/settings/teams", icon: UsersIcon },
	{
		id: "keyboard",
		title: "Keyboard shortcuts",
		path: "/settings/keyboard",
		icon: KeyboardIcon,
		keywords: ["hotkeys", "shortcuts"],
	},
	{ id: "links", title: "Links", path: "/settings/links", icon: BookmarkIcon },
	{
		id: "permissions",
		title: "Permissions",
		path: "/settings/permissions",
		icon: ShieldIcon,
	},
	{ id: "hosts", title: "Hosts", path: "/settings/hosts", icon: ServerIcon },
	{
		id: "projects",
		title: "Projects",
		path: "/settings/projects",
		icon: FolderIcon,
	},
	{
		id: "ringtones",
		title: "Ringtones",
		path: "/settings/ringtones",
		icon: BellIcon,
	},
	{
		id: "billing",
		title: "Billing",
		path: "/settings/billing",
		icon: CreditCardIcon,
	},
	{
		id: "security",
		title: "Security",
		path: "/settings/security",
		icon: KeyRoundIcon,
	},
	{ id: "agents", title: "Agents", path: "/settings/agents", icon: WrenchIcon },
	{
		id: "presets",
		title: "Presets",
		path: "/settings/presets",
		icon: FileTextIcon,
	},
	{
		id: "api-keys",
		title: "API keys",
		path: "/settings/api-keys",
		icon: KeyRoundIcon,
		keywords: ["token"],
	},
];

function tabToCommand(tab: SettingsTab): Command {
	return {
		id: `settings.${tab.id}`,
		title: tab.title,
		section: "navigation",
		icon: tab.icon,
		keywords: tab.keywords,
		run: (ctx) => ctx.navigate(tab.path),
	};
}

export const settingsTabCommands = TABS.map(tabToCommand);
