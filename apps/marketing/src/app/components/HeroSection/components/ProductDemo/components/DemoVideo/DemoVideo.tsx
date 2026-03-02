"use client";

import { useEffect, useRef } from "react";

interface DemoVideoProps {
	src: string;
	isActive: boolean;
}

export function DemoVideo({ src, isActive }: DemoVideoProps) {
	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		if (isActive) {
			video.currentTime = 0;
			video.play().catch(() => {
				// Silently ignore autoplay restrictions - expected behavior
			});
		} else {
			video.pause();
		}
	}, [isActive]);

	return (
		<video
			ref={videoRef}
			src={src}
			loop
			muted
			playsInline
			className="absolute inset-0 w-full h-full object-cover"
		/>
	);
}
