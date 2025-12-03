"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";
import { DownloadButton } from "../DownloadButton";
import { SocialLinks } from "../SocialLinks";
import { WaitlistModal } from "../WaitlistModal";

export function Header() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<>
			<header className="fixed top-0 left-0 right-0 z-50">
				<div
					className="absolute inset-0 h-24 pointer-events-none"
					style={{
						background:
							"linear-gradient(to bottom, rgb(23, 23, 23) 0%, rgb(23, 23, 23) 65%, rgba(23, 23, 23, 0.9) 80%, rgba(23, 23, 23, 0.5) 90%, rgba(23, 23, 23, 0) 100%)",
					}}
				/>
				<nav className="relative max-w-[1600px] mx-auto px-8 lg:px-[30px]">
					<div className="flex items-center justify-between h-16">
						{/* Logo */}
						<motion.a
							href="/"
							className="flex items-center gap-2 group"
							initial={{ opacity: 0, x: -10 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.3 }}
						>
							<Image
								src="/title.svg"
								alt="Superset"
								width={200}
								height={61}
								className="h-10 sm:h-12 w-auto group-hover:scale-[1.02] transition-transform duration-200"
							/>
						</motion.a>

						{/* CTA Button */}
						<motion.div
							className="flex items-center gap-4"
							initial={{ opacity: 0, x: 10 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.3, delay: 0.1 }}
						>
							<SocialLinks />
							<DownloadButton
								size="sm"
								onJoinWaitlist={() => setIsWaitlistOpen(true)}
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
