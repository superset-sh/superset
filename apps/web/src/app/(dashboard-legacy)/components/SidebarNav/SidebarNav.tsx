"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { cn } from "@superset/ui/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems: { href: string; label: MessageDescriptor }[] = [
	{ href: "/", label: msg({ message: "Home" }) },
	{
		href: "/integrations",
		label: msg({ message: "Integrations" }),
	},
	{
		href: "/settings/account",
		label: msg({ message: "Account" }),
	},
];

export function SidebarNav() {
	const pathname = usePathname();

	return (
		<nav className="mt-4 flex flex-col items-start gap-3 md:mt-8">
			{navItems.map((item) => {
				const isActive =
					item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
				return (
					<Link
						key={item.href}
						href={item.href}
						className={cn(
							"font-mono transition-opacity",
							isActive
								? "underline opacity-100"
								: "opacity-60 hover:opacity-80",
						)}
					>
						{i18n._(item.label)}
					</Link>
				);
			})}
		</nav>
	);
}
