import { type MotionValue, motion, useTransform } from "framer-motion";

interface AnimatedBackgroundProps {
	progress: MotionValue<number>;
	modeCount: number;
}

export function AnimatedBackground({
	progress,
	modeCount,
}: AnimatedBackgroundProps) {
	// Calculate the width of each button (32px = h-8 w-8) + gap (4px = gap-1)
	const buttonWidth = 32;
	const gap = 4;
	const totalButtonWidth = buttonWidth + gap;

	// Transform progress (0-1) to translateX position
	// For 2 modes: 0 -> 0px, 1 -> 36px (buttonWidth + gap)
	const translateX = useTransform(
		progress,
		[0, modeCount - 1],
		[0, (modeCount - 1) * totalButtonWidth],
	);

	return (
		<motion.div
			className="absolute h-8 w-8 rounded-sm bg-tertiary-active"
			style={{
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
