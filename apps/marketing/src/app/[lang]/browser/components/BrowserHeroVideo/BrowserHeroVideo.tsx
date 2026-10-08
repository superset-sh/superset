"use client";

import { useLingui } from "@lingui/react/macro";
import { useReducedMotion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

const POSTER = "/browser/design-mode-poster.webp";

export function BrowserHeroVideo() {
	const { t } = useLingui();
	const reducedMotion = useReducedMotion();
	const videoRef = useRef<HTMLVideoElement>(null);
	const [paused, setPaused] = useState(false);

	const toggle = () => {
		const video = videoRef.current;
		if (!video) return;
		if (video.paused) {
			void video.play().catch(() => {});
		} else {
			video.pause();
		}
	};

	return (
		<div className="relative mt-14 aspect-[1280/1026] overflow-hidden border border-border bg-[#141414]">
			{reducedMotion ? (
				<Image
					src={POSTER}
					alt=""
					fill
					sizes="(min-width: 1152px) 1088px, 100vw"
					className="object-cover"
				/>
			) : (
				<>
					<video
						ref={videoRef}
						src="/browser/design-mode.mp4"
						poster={POSTER}
						autoPlay
						loop
						muted
						playsInline
						onPlay={() => setPaused(false)}
						onPause={() => setPaused(true)}
						tabIndex={-1}
						aria-hidden="true"
						className="block size-full"
					/>
					<button
						type="button"
						onClick={toggle}
						aria-label={
							paused
								? t({ message: "Play the animation" })
								: t({ message: "Pause the animation" })
						}
						className="absolute right-3 bottom-3 flex size-8 items-center justify-center rounded-full border border-border bg-background/80 text-foreground backdrop-blur-sm transition-colors hover:bg-background"
					>
						{paused ? (
							<Play className="size-3.5" />
						) : (
							<Pause className="size-3.5" />
						)}
					</button>
				</>
			)}
		</div>
	);
}
