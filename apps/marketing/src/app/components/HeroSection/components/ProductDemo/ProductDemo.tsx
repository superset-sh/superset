"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { SelectorPill } from "./components/SelectorPill";
import { DEMO_OPTIONS } from "./constants";

export function ProductDemo() {
	const [activeOption, setActiveOption] = useState<string>(
		DEMO_OPTIONS[0]?.label ?? "",
	);

	return (
		<div
			className="relative w-full rounded-lg overflow-hidden"
			style={{ aspectRatio: "710/500" }}
		>
			{/* Background gradient layers */}
			{DEMO_OPTIONS.map((option) => (
				<motion.div
					key={`bg-${option.label}`}
					className={`absolute inset-0 bg-linear-to-br ${option.gradient}`}
					initial={false}
					animate={{ opacity: activeOption === option.label ? 1 : 0 }}
					transition={{ duration: 0.5, ease: "easeInOut" }}
				/>
			))}

			{/* Video container with border */}
			<div className="absolute inset-6 bottom-20 rounded-lg border border-foreground/20 overflow-hidden">
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

			<div className="absolute bottom-4 left-6 right-6 flex items-center gap-2 overflow-x-auto">
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
			className="absolute -inset-px object-cover"
		/>
	);
}
