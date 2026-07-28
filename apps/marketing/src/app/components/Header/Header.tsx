"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DesktopNav } from "./components/DesktopNav";
import { MobileNav } from "./components/MobileNav";
import { SupersetLogo } from "./components/SupersetLogo";

interface HeaderProps {
	ctaButtons: React.ReactNode;
	starCounter?: React.ReactNode;
}

export function Header({ ctaButtons, starCounter }: HeaderProps) {
	const pathname = usePathname();
	if (pathname === "/download") return null;

	return (
		<header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
			<div className="px-4 sm:px-6">
				<div className="flex items-center justify-between h-16">
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.3 }}
						className="flex items-center"
					>
						<Link
							href="/"
							className="flex items-center text-foreground hover:text-foreground/80 transition-colors"
						>
							<SupersetLogo />
						</Link>
					</motion.div>

					<motion.div
						className="hidden lg:flex items-center gap-8"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.3, delay: 0.1 }}
					>
						<DesktopNav />
						{starCounter}
						<div className="flex items-center gap-3 shrink-0">{ctaButtons}</div>
					</motion.div>

					<MobileNav ctaButtons={ctaButtons} starCounter={starCounter} />
				</div>
			</div>
		</header>
	);
}
