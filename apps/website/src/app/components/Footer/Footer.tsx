"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { SocialLinks } from "../SocialLinks";

export function Footer() {
	return (
		<footer className="border-t border-zinc-800">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-8 sm:py-12">
				<motion.div
					initial={{ opacity: 0 }}
					whileInView={{ opacity: 1 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
					className="flex flex-col sm:flex-row justify-between items-center gap-4"
				>
					<div className="flex items-center gap-2">
						<Image
							src="/title.svg"
							alt="Superset"
							width={200}
							height={61}
							className="h-8 sm:h-10 w-auto"
						/>
					</div>
					<div className="flex items-center gap-6">
						<SocialLinks />
						<p className="text-zinc-400 text-sm">
							© {new Date().getFullYear()} Superset. All rights reserved.
						</p>
					</div>
				</motion.div>
			</div>
		</footer>
	);
}
