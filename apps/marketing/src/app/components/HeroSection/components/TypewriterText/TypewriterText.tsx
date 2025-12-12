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

	return (
		<span className={className} style={style}>
			{displayedText}
			{showCursor && (
				<motion.span
					className="inline-block ml-0.5"
					animate={{ opacity: [1, 0] }}
					transition={{
						duration: 0.5,
						repeat: Number.POSITIVE_INFINITY,
						repeatType: "reverse",
					}}
				>
					|
				</motion.span>
			)}
		</span>
	);
}
