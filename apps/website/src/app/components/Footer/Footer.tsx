"use client";

import { motion } from "framer-motion";

export function Footer() {
	return (
		<footer className="bg-black border-t border-zinc-800">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-8 sm:py-12">
				<motion.div
					initial={{ opacity: 0 }}
					whileInView={{ opacity: 1 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
					className="flex flex-col sm:flex-row justify-between items-center gap-4"
				>
					<div className="flex items-center gap-2">
						<span className="text-white font-bold text-2xl">⊇</span>
						<span className="text-white font-semibold">Superset</span>
					</div>
					<div className="flex items-center gap-6">
						<a
							href="https://x.com/superset_sh"
							target="_blank"
							rel="noopener noreferrer"
							className="text-zinc-400 hover:text-white transition-colors"
							aria-label="Follow us on X/Twitter"
						>
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="currentColor"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
							</svg>
						</a>
						<p className="text-zinc-400 text-sm">
							© {new Date().getFullYear()} Superset. All rights reserved.
						</p>
					</div>
				</motion.div>
			</div>
		</footer>
	);
}
