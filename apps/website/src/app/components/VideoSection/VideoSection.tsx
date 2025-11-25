import { motion } from "framer-motion";

export function VideoSection() {
	return (
		<section className="pt-8 sm:pt-12 md:pt-16 pb-16 sm:pb-24 md:pb-32 px-4 sm:px-6 md:px-8 bg-black">
			<div className="max-w-5xl mx-auto">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-100px" }}
					transition={{ duration: 0.5, ease: "easeOut" }}
					className="w-full"
				>
					{/* Video placeholder */}
					<div className="relative w-full aspect-video bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800">
						<div className="absolute inset-0 flex items-center justify-center">
							<div className="text-center">
								<svg
									className="w-16 h-16 mx-auto mb-4 text-zinc-600"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
									/>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<p className="text-zinc-500 text-sm sm:text-base">
									Demo video coming soon
								</p>
							</div>
						</div>
					</div>
				</motion.div>
			</div>
		</section>
	);
}
