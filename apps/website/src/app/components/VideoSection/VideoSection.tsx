"use client";

import { motion } from "framer-motion";

export function VideoSection() {
	return (
		<section className="relative py-24 px-8 lg:px-[30px]">
			<div className="max-w-[1200px] mx-auto">
				{/* Heading */}
				<motion.div
					className="mb-12"
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
				>
					<div className="space-y-1 mb-6">
						<h2 className="text-2xl sm:text-3xl font-mono tracking-[-0.01em] text-stone-100">
							A Superset of your favorite tools
						</h2>
						<p className="text-base sm:text-lg font-light tracking-[-0.03em] text-neutral-400 max-w-[700px]">
							Get all the best AI coding tools in one place. We want to support
							and stay compatible with whatever CLI agents you already use.
						</p>
					</div>
				</motion.div>

				{/* Video Demo Area */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5, delay: 0.2 }}
				>
					<div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-neutral-800">
						<iframe
							className="absolute inset-0 w-full h-full"
							src="https://www.youtube.com/embed/dkD-U7JXkbI?control=0"
							title="Superset Demo"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
							allowFullScreen
						/>
					</div>
				</motion.div>
			</div>
		</section>
	);
}
