import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
	BeakerIcon,
	BellIcon,
	BookmarkIcon,
	BuildingIcon,
	ChartBarIcon,
	CpuIcon,
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
			id: "commandPalette.settingsTab.account",
			message: "Account",
		}),
		path: "/settings/account",
		icon: UserIcon,
	},
	{
		id: "appearance",
		title: msg({
			id: "commandPalette.settingsTab.appearance",
			message: "Appearance",
		}),
		path: "/settings/appearance",
		icon: PaletteIcon,
		keywords: ["theme", "color"],
	},
	{
		id: "behavior",
		title: msg({
			id: "commandPalette.settingsTab.behavior",
			message: "Behavior",
		}),
		path: "/settings/behavior",
		icon: SlidersIcon,
	},
	{
		id: "models",
		title: msg({ id: "commandPalette.settingsTab.models", message: "Models" }),
		path: "/settings/models",
		icon: CpuIcon,
		keywords: ["ai", "llm"],
	},
	{
		id: "terminal",
		title: msg({
			id: "commandPalette.settingsTab.terminal",
			message: "Terminal",
		}),
		path: "/settings/terminal",
		icon: TerminalIcon,
		keywords: ["terminal scripts", "scripts", "presets", "commands"],
	},
	{
		id: "git",
		title: msg({ id: "commandPalette.settingsTab.git", message: "Git" }),
		path: "/settings/git",
		icon: GitBranchIcon,
	},
	{
		id: "experimental",
		title: msg({
			id: "commandPalette.settingsTab.experimental",
			message: "Experimental",
		}),
		path: "/settings/experimental",
		icon: BeakerIcon,
	},
	{
		id: "integrations",
		title: msg({
			id: "commandPalette.settingsTab.integrations",
			message: "Integrations",
		}),
		path: "/settings/integrations",
		icon: LinkIcon,
	},
	{
		id: "organization",
		title: msg({
			id: "commandPalette.settingsTab.organization",
			message: "Organization",
		}),
		path: "/settings/organization",
		icon: BuildingIcon,
	},
	{
		id: "teams",
		title: msg({ id: "commandPalette.settingsTab.teams", message: "Teams" }),
		path: "/settings/teams",
		icon: UsersIcon,
	},
	{
		id: "keyboard",
		title: msg({
			id: "commandPalette.settingsTab.keyboard",
			message: "Keyboard shortcuts",
		}),
		path: "/settings/keyboard",
		icon: KeyboardIcon,
		keywords: ["hotkeys", "shortcuts"],
	},
	{
		id: "links",
		title: msg({ id: "commandPalette.settingsTab.links", message: "Links" }),
		path: "/settings/links",
		icon: BookmarkIcon,
	},
	{
		id: "permissions",
		title: msg({
			id: "commandPalette.settingsTab.permissions",
			message: "Permissions",
		}),
		path: "/settings/permissions",
		icon: ShieldIcon,
	},
	{
		id: "hosts",
		title: msg({ id: "commandPalette.settingsTab.hosts", message: "Hosts" }),
		path: "/settings/hosts",
		icon: ServerIcon,
	},
	{
		id: "projects",
		title: msg({
			id: "commandPalette.settingsTab.projects",
			message: "Projects",
		}),
		path: "/settings/projects",
		icon: FolderIcon,
	},
	{
		id: "ringtones",
		title: msg({
			id: "commandPalette.settingsTab.ringtones",
			message: "Ringtones",
		}),
		path: "/settings/ringtones",
		icon: BellIcon,
	},
	{
		id: "usage",
		title: msg({ id: "commandPalette.settingsTab.usage", message: "Usage" }),
		path: "/settings/usage",
		icon: ChartBarIcon,
		keywords: ["tokens", "cost", "quota", "cpu", "memory", "resources"],
	},
	{
		id: "billing",
		title: msg({
			id: "commandPalette.settingsTab.billing",
			message: "Billing",
		}),
		path: "/settings/billing",
		icon: CreditCardIcon,
	},
	{
		id: "security",
		title: msg({
			id: "commandPalette.settingsTab.security",
			message: "Remote Access",
		}),
		path: "/settings/security",
		icon: KeyRoundIcon,
		keywords: ["security", "relay"],
	},
	{
		id: "agents",
		title: msg({ id: "commandPalette.settingsTab.agents", message: "Agents" }),
		path: "/settings/agents",
		icon: WrenchIcon,
	},
	{
		id: "api-keys",
		title: msg({
			id: "commandPalette.settingsTab.apiKeys",
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
