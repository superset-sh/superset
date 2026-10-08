"use client";

import { useLingui } from "@lingui/react/macro";
import Image from "next/image";
import { useState } from "react";
import { FaPlay } from "react-icons/fa";

const YOUTUBE_ID = "KHEDsIHKcu4";

export function PagesDemoVideo() {
	const { t } = useLingui();
	const [isPlaying, setIsPlaying] = useState(false);
	const title = t({ message: "Superset Pages demo" });

	return (
		<div className="relative aspect-video w-full overflow-hidden border border-border bg-card">
			{isPlaying ? (
				<iframe
					src={`https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0`}
					title={title}
					allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
					allowFullScreen
					className="absolute inset-0 size-full"
				/>
			) : (
				<button
					type="button"
					onClick={() => setIsPlaying(true)}
					aria-label={t({ message: "Play the Superset Pages demo" })}
					className="group absolute inset-0 size-full"
				>
					<Image
						src="/pages/demo-thumbnail.webp"
						alt=""
						fill
						sizes="(min-width: 1152px) 1088px, 100vw"
						className="object-cover transition-opacity group-hover:opacity-90"
					/>
					<span className="absolute inset-0 m-auto flex size-16 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform group-hover:scale-105 sm:size-20">
						<FaPlay aria-hidden="true" className="ml-1 size-5 sm:size-6" />
					</span>
				</button>
			)}
		</div>
	);
}
