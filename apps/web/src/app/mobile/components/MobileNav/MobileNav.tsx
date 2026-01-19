"use client";

import { cn } from "@superset/ui/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
	{
		href: "/mobile",
		label: "Workspaces",
		icon: WorkspacesIcon,
	},
	{
		href: "/mobile/scan",
		label: "Scan",
		icon: ScanIcon,
	},
];

export function MobileNav() {
	const pathname = usePathname();

	return (
		<nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/95 backdrop-blur-sm">
			<div className="flex h-16 items-center justify-around px-4 pb-safe">
				{navItems.map((item) => {
					const isActive =
						pathname === item.href ||
						(item.href !== "/mobile" && pathname.startsWith(item.href));
					const Icon = item.icon;

					return (
						<Link
							key={item.href}
							href={item.href}
							className={cn(
								"flex flex-col items-center gap-1 px-4 py-2 transition-colors",
								isActive ? "text-white" : "text-white/50 hover:text-white/70",
							)}
						>
							<Icon className="h-5 w-5" />
							<span className="text-xs">{item.label}</span>
						</Link>
					);
				})}
			</div>
		</nav>
	);
}

function WorkspacesIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<rect x="3" y="3" width="7" height="7" rx="1" />
			<rect x="14" y="3" width="7" height="7" rx="1" />
			<rect x="3" y="14" width="7" height="7" rx="1" />
			<rect x="14" y="14" width="7" height="7" rx="1" />
		</svg>
	);
}

function ScanIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M3 7V5a2 2 0 0 1 2-2h2" />
			<path d="M17 3h2a2 2 0 0 1 2 2v2" />
			<path d="M21 17v2a2 2 0 0 1-2 2h-2" />
			<path d="M7 21H5a2 2 0 0 1-2-2v-2" />
			<rect x="7" y="7" width="10" height="10" rx="1" />
		</svg>
	);
}
