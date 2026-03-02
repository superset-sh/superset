"use client";

import Image from "next/image";
import { useState } from "react";

interface YouTubeVideoProps {
	id: string;
	title?: string;
	thumbnail: string;
}

export function YouTubeVideo({
	id,
	title = "Video",
	thumbnail,
}: YouTubeVideoProps) {
	const [isPlaying, setIsPlaying] = useState(false);

	if (isPlaying) {
		return (
			<div className="my-6">
				<div className="relative w-full aspect-video rounded-xl overflow-hidden bg-muted shadow-lg ring-1 ring-white/10">
					<iframe
						className="absolute inset-0 w-full h-full"
						src={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
						title={title}
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
						allowFullScreen
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="my-6">
			<button
				type="button"
				onClick={() => setIsPlaying(true)}
				className="group relative w-full cursor-pointer rounded-xl overflow-hidden shadow-lg ring-1 ring-white/10"
				aria-label={`Play ${title}`}
			>
				<Image
					src={thumbnail}
					alt={title}
					width={1200}
					height={675}
					className="w-full h-auto"
				/>
				<div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/30" />
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-md border border-white/30 shadow-xl transition-transform duration-300 group-hover:scale-110">
						<div className="ml-1 w-0 h-0 border-t-[10px] border-t-transparent border-l-[16px] border-l-white border-b-[10px] border-b-transparent sm:border-t-[12px] sm:border-l-[20px] sm:border-b-[12px]" />
					</div>
				</div>
			</button>
		</div>
	);
}
