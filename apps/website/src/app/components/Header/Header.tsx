"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";
import { WaitlistModal } from "../WaitlistModal";
import { JoinWaitlistButton } from "../JoinWaitlistButton";
import { DownloadButton } from "../DownloadButton";

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
							<a
								href="https://github.com/superset-sh/superset"
								target="_blank"
								rel="noopener noreferrer"
								className="text-zinc-400 hover:text-white transition-colors p-2 -mr-2"
								aria-label="View on GitHub"
							>
								<svg
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="currentColor"
									xmlns="http://www.w3.org/2000/svg"
								>
									<title>GitHub</title>
									<path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
								</svg>
							</a>
							<DownloadButton
								size="sm"
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
