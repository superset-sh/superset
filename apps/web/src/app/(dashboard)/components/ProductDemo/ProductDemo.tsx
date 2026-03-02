"use client";

import { MeshGradient } from "@superset/ui/mesh-gradient";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const DEMO_OPTIONS = [
	{
		label: "Use Any Agents",
		videoPath: "/hero/agents.mp4",
		colors: ["#7f1d1d", "#991b1b", "#450a0a", "#1a1a2e"] as const,
	},
	{
		label: "Create Parallel Branches",
		videoPath: "/hero/worktrees.mp4",
		colors: ["#1e40af", "#1e3a8a", "#172554", "#1a1a2e"] as const,
	},
	{
		label: "See Changes",
		videoPath: "/hero/changes.mp4",
		colors: ["#b45309", "#92400e", "#78350f", "#1a1a2e"] as const,
	},
	{
		label: "Open in Any IDE",
		videoPath: "/hero/open-in.mp4",
		colors: ["#047857", "#065f46", "#064e3b", "#1a1a2e"] as const,
	},
];

function DemoVideo({ src, isActive }: { src: string; isActive: boolean }) {
	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		if (isActive) {
			video.currentTime = 0;
			video.play().catch(() => {});
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
			className="absolute inset-0 h-full w-full object-cover"
		/>
	);
}

function SelectorPill({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			className={`inline-flex cursor-pointer items-center justify-center whitespace-nowrap border py-2 text-sm ${
				active
					? "border-foreground bg-foreground/90 text-background/80"
					: "border-foreground/20 bg-foreground/5 text-foreground/80 hover:border-foreground/30 hover:bg-foreground/10"
			}`}
			animate={{
				paddingLeft: active ? 22 : 16,
				paddingRight: active ? 22 : 16,
			}}
			transition={{ duration: 0.2, ease: "easeOut" }}
		>
			{label}
		</motion.button>
	);
}

export function ProductDemo() {
	const [activeOption, setActiveOption] = useState(
		DEMO_OPTIONS[0]?.label ?? "",
	);

	return (
		<div className="relative w-full overflow-hidden rounded-lg">
			{DEMO_OPTIONS.map((option) => (
				<motion.div
					key={`gradient-${option.label}`}
					className="absolute inset-0"
					initial={false}
					animate={{ opacity: activeOption === option.label ? 1 : 0 }}
					transition={{ duration: 0.5, ease: "easeInOut" }}
				>
					<MeshGradient
						colors={option.colors}
						className="absolute inset-0 h-full w-full"
					/>
				</motion.div>
			))}

			<div className="relative flex flex-col gap-4 p-4">
				<div
					className="relative w-full overflow-hidden rounded-lg"
					style={{ aspectRatio: "1728/1080" }}
				>
					{DEMO_OPTIONS.map((option) => (
						<motion.div
							key={option.label}
							className="absolute -inset-px"
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
