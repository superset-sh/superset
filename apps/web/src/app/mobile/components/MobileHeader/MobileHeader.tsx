"use client";

import { cn } from "@superset/ui/utils";
import Link from "next/link";

export function MobileHeader() {
	return (
		<header
			className={cn(
				"sticky top-0 z-50 flex h-14 items-center justify-between border-b border-white/10 bg-black/95 px-4 backdrop-blur-sm",
			)}
		>
			<Link href="/mobile" className="flex items-center gap-2">
				<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
					<span className="text-sm font-bold text-black">S</span>
				</div>
				<span className="text-lg font-medium text-white">Superset</span>
			</Link>

			<Link
				href="/mobile/scan"
				className="flex h-9 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm text-white transition-colors hover:bg-white/20"
			>
				<ScanIcon className="h-4 w-4" />
				<span>Scan</span>
			</Link>
		</header>
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
