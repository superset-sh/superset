"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { MeshGradient } from "./components/MeshGradient";
import { SelectorPill } from "./components/SelectorPill";
import { DEMO_OPTIONS } from "./constants";

export function ProductDemo() {
	const [activeOption, setActiveOption] = useState<string>(
		DEMO_OPTIONS[0]?.label ?? "",
	);

	const activeColors = useMemo(() => {
		const option = DEMO_OPTIONS.find((o) => o.label === activeOption);
		return option?.colors ?? DEMO_OPTIONS[0]?.colors;
	}, [activeOption]);

	return (
		<div className="relative w-full rounded-lg overflow-hidden">
			{/* Animated mesh gradient background */}
			{activeColors && (
				<MeshGradient
					key={activeOption}
					colors={activeColors}
					className="absolute inset-0 w-full h-full"
				/>
			)}

			{/* Content wrapper */}
			<div className="relative flex flex-col gap-4 p-6">
				{/* Video container with border */}
				<div
					className="relative w-full rounded-lg border border-foreground/20 overflow-hidden"
					style={{ aspectRatio: "1728/1080" }}
				>
					{DEMO_OPTIONS.map((option) => (
						<motion.div
							key={option.label}
							className="absolute inset-0"
							initial={false}
							animate={{ opacity: activeOption === option.label ? 1 : 0 }}
							transition={{ duration: 0.5, ease: "easeInOut" }}
						>
							<DemoVideo
								src={option.videoPath}
								isActive={activeOption === option.label}
							/>
						</motion.div>
					))}
				</div>

				{/* Selector pills */}
				<div className="flex items-center gap-2 overflow-x-auto">
					{DEMO_OPTIONS.map((option) => (
						<SelectorPill
							key={option.label}
							label={option.label}
							active={activeOption === option.label}
							onClick={() => setActiveOption(option.label)}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

interface DemoVideoProps {
	src: string;
	isActive: boolean;
}

function DemoVideo({ src, isActive }: DemoVideoProps) {
	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		if (isActive) {
			video.currentTime = 0;
			video.play();
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
