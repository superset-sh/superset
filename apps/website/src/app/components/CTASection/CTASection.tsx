"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";

export function CTASection() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<>
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

					<motion.div
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.5, delay: 0.1 }}
					>
						<DownloadButton onJoinWaitlist={() => setIsWaitlistOpen(true)} />
					</motion.div>
				</div>
			</section>
			<WaitlistModal
				isOpen={isWaitlistOpen}
				onClose={() => setIsWaitlistOpen(false)}
			/>
		</>
	);
}
