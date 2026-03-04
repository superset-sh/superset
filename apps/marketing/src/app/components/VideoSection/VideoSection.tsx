"use client";

import Image from "next/image";
import { useState } from "react";

const VIDEO_ID = "mk02bSQmEKY";
const VIDEO_START_SECONDS = 8;

export function VideoSection() {
	const [isPlaying, setIsPlaying] = useState(false);

	return (
		<section className="relative py-12 px-8 lg:px-[30px]">
			<div className="max-w-7xl mx-auto">
				<div className="mb-12">
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
				</div>

				<div>
					<div className="group relative w-full aspect-video rounded-xl overflow-hidden bg-muted shadow-2xl ring-1 ring-white/10">
						{isPlaying ? (
							<iframe
								className="absolute inset-0 w-full h-full"
								src={`https://www.youtube.com/embed/${VIDEO_ID}?start=${VIDEO_START_SECONDS}&autoplay=1&rel=0&modestbranding=1`}
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
								<Image
									src="/images/video-thumbnail.png"
									alt="Video thumbnail"
									fill
									className="object-cover"
									sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1280px"
								/>
								<div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/30" />
								<div className="absolute inset-0 flex items-center justify-center">
									<div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-md border border-white/30 shadow-xl transition-transform duration-300 group-hover:scale-110">
										<div className="ml-1 w-0 h-0 border-t-[10px] border-t-transparent border-l-[16px] border-l-white border-b-[10px] border-b-transparent sm:border-t-[12px] sm:border-l-[20px] sm:border-b-[12px]" />
									</div>
								</div>
							</button>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}
