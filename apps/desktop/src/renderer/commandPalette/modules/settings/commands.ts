import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
	BeakerIcon,
	BellIcon,
	BookmarkIcon,
	BuildingIcon,
	ChartBarIcon,
	CreditCardIcon,
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
	title: MessageDescriptor;
	path: string;
	icon: LucideIcon;
	keywords?: string[];
}

const TABS: SettingsTab[] = [
	{
		id: "account",
		title: msg({
			message: "Account",
		}),
		path: "/settings/account",
		icon: UserIcon,
	},
	{
		id: "appearance",
		title: msg({
			message: "Appearance",
		}),
		path: "/settings/appearance",
		icon: PaletteIcon,
		keywords: ["theme", "color"],
	},
	{
		id: "behavior",
		title: msg({
			message: "Behavior",
		}),
		path: "/settings/behavior",
		icon: SlidersIcon,
	},
	{
		id: "terminal",
		title: msg({
			message: "Terminal",
		}),
		path: "/settings/terminal",
		icon: TerminalIcon,
		keywords: ["terminal scripts", "scripts", "presets", "commands"],
	},
	{
		id: "git",
		title: msg({ message: "Git" }),
		path: "/settings/git",
		icon: GitBranchIcon,
	},
	{
		id: "experimental",
		title: msg({
			message: "Experimental",
		}),
		path: "/settings/experimental",
		icon: BeakerIcon,
	},
	{
		id: "integrations",
		title: msg({
			message: "Integrations",
		}),
		path: "/settings/integrations",
		icon: LinkIcon,
	},
	{
		id: "organization",
		title: msg({
			message: "Organization",
		}),
		path: "/settings/organization",
		icon: BuildingIcon,
	},
	{
		id: "teams",
		title: msg({ message: "Teams" }),
		path: "/settings/teams",
		icon: UsersIcon,
	},
	{
		id: "keyboard",
		title: msg({
			message: "Keyboard shortcuts",
		}),
		path: "/settings/keyboard",
		icon: KeyboardIcon,
		keywords: ["hotkeys", "shortcuts"],
	},
	{
		id: "links",
		title: msg({ message: "Links" }),
		path: "/settings/links",
		icon: BookmarkIcon,
	},
	{
		id: "permissions",
		title: msg({
			message: "Permissions",
		}),
		path: "/settings/permissions",
		icon: ShieldIcon,
	},
	{
		id: "hosts",
		title: msg({ message: "Hosts" }),
		path: "/settings/hosts",
		icon: ServerIcon,
	},
	{
		id: "projects",
		title: msg({
			message: "Projects",
		}),
		path: "/settings/projects",
		icon: FolderIcon,
	},
	{
		id: "ringtones",
		title: msg({
			message: "Ringtones",
		}),
		path: "/settings/ringtones",
		icon: BellIcon,
	},
	{
		id: "usage",
		title: msg({ message: "Usage" }),
		path: "/settings/usage",
		icon: ChartBarIcon,
		keywords: ["tokens", "cost", "quota", "cpu", "memory", "resources"],
	},
	{
		id: "billing",
		title: msg({
			message: "Billing",
		}),
		path: "/settings/billing",
		icon: CreditCardIcon,
	},
	{
		id: "security",
		title: msg({
			message: "Remote Access",
		}),
		path: "/settings/security",
		icon: KeyRoundIcon,
		keywords: ["security", "relay"],
	},
	{
		id: "agents",
		title: msg({ message: "Agents" }),
		path: "/settings/agents",
		icon: WrenchIcon,
	},
	{
		id: "api-keys",
		title: msg({
			message: "API keys",
		}),
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
