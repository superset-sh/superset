import { type MotionValue, motion, useTransform } from "framer-motion";

interface AnimatedBackgroundProps {
	progress: MotionValue<number>;
	modeCount: number;
}

export function AnimatedBackground({
	progress,
	modeCount,
}: AnimatedBackgroundProps) {
	// Calculate the width of each button (36px = h-9 w-9) + gap (4px = gap-1)
	const buttonWidth = 36;
	const gap = 4;
	const totalButtonWidth = buttonWidth + gap;

	// Transform progress (0-1) to translateX position
	// For 2 modes: 0 -> 0px, 1 -> 40px (buttonWidth + gap)
	const translateX = useTransform(
		progress,
		[0, modeCount - 1],
		[0, (modeCount - 1) * totalButtonWidth]
	);

	return (
		<motion.div
			className="absolute h-9 rounded bg-neutral-800/60"
			style={{
				width: buttonWidth,
				x: translateX,
			}}
			initial={false}
			transition={{
				type: "spring",
				stiffness: 300,
				damping: 30,
			}}
		/>
	);
}

