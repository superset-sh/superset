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
						<h2
							className="text-2xl sm:text-3xl xl:text-4xl font-medium tracking-tight text-foreground"
							style={{
								fontFamily: "var(--font-geist-pixel-square)",
								textShadow: "2px 2px 0 rgba(0,0,0,0.4)",
							}}
						>
							Code 10x faster with no switching cost
						</h2>
						<p className="text-lg sm:text-xl font-light tracking-[-0.03em] text-muted-foreground max-w-[700px]">
							Superset works with your existing tools. We provide
							parallelization and better UX to enhance your Claude Code,
							OpenCode, Cursor, etc.
						</p>
					</div>
				</div>

				<div>
					<div className="group relative w-full aspect-video overflow-hidden mc-torch-glow">
						{/* Outer item frame */}
						<div
							className="absolute inset-0 border-[5px] pointer-events-none z-20"
							style={{ borderColor: "#8B6542 #2C1A0E #2C1A0E #8B6542" }}
						/>
						{/* Inner bevel */}
						<div
							className="absolute inset-[3px] border-2 pointer-events-none z-20"
							style={{ borderColor: "#6B4D30 #1A0E06 #1A0E06 #6B4D30" }}
						/>
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
									{/* Emerald green play button with 3D bevel */}
									<div
										className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center bg-[#5DB65D] border-4"
										style={{
											borderColor: "#7dce7d #3a6b20 #3a6b20 #7dce7d",
										}}
									>
										<div className="ml-1 w-0 h-0 border-t-[10px] border-t-transparent border-l-[16px] border-l-[#F5E6D0] border-b-[10px] border-b-transparent sm:border-t-[12px] sm:border-l-[20px] sm:border-b-[12px]" />
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
