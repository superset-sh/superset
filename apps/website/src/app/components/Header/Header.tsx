"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";
import { DownloadButton } from "../DownloadButton";
import { JoinWaitlistButton } from "../JoinWaitlistButton";
import { SocialLinks } from "../SocialLinks";
import { WaitlistModal } from "../WaitlistModal";

export function Header() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<>
			<header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-lg border-b border-zinc-800/50">
				<nav className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
					<div className="flex items-center justify-between h-14 sm:h-16">
						{/* Logo */}
						<motion.a
							href="/"
							className="flex items-center gap-2 group"
							initial={{ opacity: 0, x: -20 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.5 }}
						>
							<Image
								src="/title.svg"
								alt="Superset"
								width={200}
								height={61}
								className="h-10 sm:h-12 w-auto group-hover:scale-105 transition-transform"
							/>
						</motion.a>

						{/* CTA Button */}
						<motion.div
							className="flex items-center gap-4"
							initial={{ opacity: 0, x: 20 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.5, delay: 0.2 }}
						>
							<SocialLinks />
							<DownloadButton
								size="sm"
								className="hidden"
								onJoinWindowsWaitlist={() => setIsWaitlistOpen(true)}
							/>
							<JoinWaitlistButton
								onClick={() => setIsWaitlistOpen(true)}
								size="sm"
							/>
						</motion.div>
					</div>
				</nav>
			</header>

			<WaitlistModal
				isOpen={isWaitlistOpen}
				onClose={() => setIsWaitlistOpen(false)}
			/>
		</>
	);
}
