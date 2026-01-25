"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Play } from "lucide-react";

const VIDEO_ID = "dkD-U7JXkbI";

export function VideoSection() {
	const [isPlaying, setIsPlaying] = useState(false);

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
					<div className="group relative w-full aspect-video rounded-xl overflow-hidden bg-muted shadow-2xl ring-1 ring-white/10">
						{isPlaying ? (
							<iframe
								className="absolute inset-0 w-full h-full"
								src={`https://www.youtube.com/embed/${VIDEO_ID}?autoplay=1&rel=0&modestbranding=1`}
								title="Superset Demo"
								allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
								allowFullScreen
							/>
						) : (
							<button
								type="button"
								onClick={() => setIsPlaying(true)}
								className="relative w-full h-full cursor-pointer"
								aria-label="Play video"
							>
								<img
									src="/images/video-thumbnail.png"
									alt="Video thumbnail"
									className="absolute inset-0 w-full h-full object-cover"
								/>
								<div className="absolute inset-0 bg-black/30 transition-opacity duration-300 group-hover:bg-black/40" />
								<div className="absolute inset-0 flex items-center justify-center">
									<div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-white/95 shadow-xl transition-transform duration-300 group-hover:scale-110">
										<Play className="h-7 w-7 sm:h-8 sm:w-8 fill-current text-black ml-1" />
									</div>
								</div>
							</button>
						)}
					</div>
				</motion.div>
			</div>
		</section>
	);
}
