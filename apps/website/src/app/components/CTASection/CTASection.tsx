"use client";

import { motion } from "framer-motion";
import { HiMiniArrowDownTray } from "react-icons/hi2";

export function CTASection() {
	return (
		<section className="relative py-32 px-8 lg:px-[30px]">
			<div className="max-w-[1200px] mx-auto flex flex-col items-center text-center">
				<motion.h2
					className="text-[32px] lg:text-[40px] font-normal tracking-normal leading-[1.3em] text-white mb-8"
					style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
				>
					Give us a try
				</motion.h2>

				<motion.a
					href="https://github.com/superset-sh/superset/releases"
					className="inline-flex items-center bg-[#f9f9f5] hover:bg-[#f0efeb] rounded-[5px] px-8 py-4 transition-colors"
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5, delay: 0.1 }}
				>
					<span className="text-lg font-medium text-[#2a2b25]">
						Download for MacOS
					</span>
					<HiMiniArrowDownTray className="ml-3 size-5 text-[#2a2b25]" />
				</motion.a>
			</div>
		</section>
	);
}
