"use client";

import { motion } from "framer-motion";

export function VideoSection() {
	return (
		<section className="relative py-12 px-8 lg:px-[30px]">
			<div className="max-w-7xl mx-auto">
				<motion.div
					className="mb-12"
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
				>
					<div className="space-y-1">
						<h2 className="text-2xl sm:text-3xl xl:text-4xl font-medium tracking-tight text-foreground">
							Code 10x faster with no switching cost
						</h2>
						<p className="text-lg sm:text-xl font-light tracking-[-0.03em] text-muted-foreground max-w-[700px]">
							Superset works with your existing tools. We provides
							parallelization and better UX to enhance your Claude Code,
							OpenCode, Cursor, etc.
						</p>
					</div>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5, delay: 0.2 }}
				>
					<div className="relative w-full aspect-video rounded overflow-hidden bg-muted">
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
