"use client";

import { cn } from "@superset/ui/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
	{ href: "/", label: "Home" },
	{ href: "/integrations", label: "Integrations" },
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
						{item.label}
					</Link>
				);
			})}
		</nav>
	);
}
