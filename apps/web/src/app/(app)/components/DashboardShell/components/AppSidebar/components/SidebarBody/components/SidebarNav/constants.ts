import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Blocks, Bot, Home, type LucideIcon, User } from "lucide-react";

export interface NavItem {
	href: string;
	label: MessageDescriptor;
	icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
	{ href: "/", label: msg({ message: "Home" }), icon: Home },
	{ href: "/agents", label: msg({ message: "Agents" }), icon: Bot },
	{
		href: "/integrations",
		label: msg({ message: "Integrations" }),
		icon: Blocks,
	},
	{
		href: "/settings/account",
		label: msg({ message: "Account" }),
		icon: User,
	},
];
