"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { DesktopNav } from "./components/DesktopNav";
import { MobileNav } from "./components/MobileNav";
import { SupersetLogo } from "./components/SupersetLogo";

interface HeaderProps {
	ctaButtons: React.ReactNode;
	starCounter?: React.ReactNode;
}

export function Header({ ctaButtons, starCounter }: HeaderProps) {
	return (
		<header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex items-center justify-between h-14">
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
						className="hidden md:flex items-center gap-4"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.3, delay: 0.1 }}
					>
						<DesktopNav />
						<div className="h-4 w-px bg-border" />
						{starCounter}
						<div className="flex items-center gap-2">{ctaButtons}</div>
					</motion.div>

					<MobileNav ctaButtons={ctaButtons} starCounter={starCounter} />
				</div>
			</div>
		</header>
	);
}
