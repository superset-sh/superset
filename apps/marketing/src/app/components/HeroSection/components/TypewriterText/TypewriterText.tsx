"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface TextSegment {
	text: string;
	className?: string;
	style?: React.CSSProperties;
}

interface TypewriterTextProps {
	text?: string;
	segments?: TextSegment[];
	className?: string;
	style?: React.CSSProperties;
	speed?: number;
	delay?: number;
	showCursor?: boolean;
}

export function TypewriterText({
	text,
	segments,
	className,
	style,
	speed = 50,
	delay = 500,
	showCursor = true,
}: TypewriterTextProps) {
	const fullText = segments
		? segments.map((s) => s.text).join("")
		: (text ?? "");
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

		if (displayedText.length < fullText.length) {
			const timeout = setTimeout(() => {
				setDisplayedText(fullText.slice(0, displayedText.length + 1));
			}, speed);

			return () => clearTimeout(timeout);
		}
	}, [displayedText, isTyping, speed, fullText]);

	const isTypingComplete = isTyping && displayedText.length === fullText.length;

	const renderText = () => {
		if (!segments) return displayedText;

		let charIndex = 0;
		return segments.map((segment) => {
			const segStart = charIndex;
			charIndex += segment.text.length;

			if (segStart >= displayedText.length) return null;

			const visibleText = segment.text.slice(
				0,
				Math.min(segment.text.length, displayedText.length - segStart),
			);

			return (
				<span
					key={segment.text}
					className={segment.className}
					style={segment.style}
				>
					{visibleText}
				</span>
			);
		});
	};

	return (
		<span className={className} style={style}>
			{renderText()}
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
