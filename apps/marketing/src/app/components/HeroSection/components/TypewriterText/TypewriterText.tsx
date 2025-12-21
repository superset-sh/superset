"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface TypewriterTextProps {
	text: string;
	className?: string;
	style?: React.CSSProperties;
	speed?: number;
	delay?: number;
	showCursor?: boolean;
}

export function TypewriterText({
	text,
	className,
	style,
	speed = 50,
	delay = 500,
	showCursor = true,
}: TypewriterTextProps) {
	const [displayedText, setDisplayedText] = useState("");
	const [isTyping, setIsTyping] = useState(false);

	useEffect(() => {
		const startTimeout = setTimeout(() => {
			setIsTyping(true);
		}, delay);

		return () => clearTimeout(startTimeout);
	}, [delay]);

	useEffect(() => {
		if (!isTyping) return;

		if (displayedText.length < text.length) {
			const timeout = setTimeout(() => {
				setDisplayedText(text.slice(0, displayedText.length + 1));
			}, speed);

			return () => clearTimeout(timeout);
		}
	}, [displayedText, isTyping, speed, text]);

	const isTypingComplete = isTyping && displayedText.length === text.length;

	return (
		<span className={className} style={style}>
			{displayedText}
			{showCursor && (
				<motion.span
					className="inline-block ml-0.5 w-3 h-[1em] bg-current translate-y-0.5"
					animate={
						isTypingComplete ? { opacity: [1, 1, 0, 0] } : { opacity: 1 }
					}
					transition={
						isTypingComplete
							? {
									duration: 1.5,
									times: [0, 0.5, 0.5, 1],
									repeat: Number.POSITIVE_INFINITY,
									ease: "linear",
								}
							: {}
					}
				/>
			)}
		</span>
	);
}
