"use client";

import { m } from "framer-motion";
import { useEffect, useState } from "react";

interface TextSegment {
	text: string;
	className?: string;
	style?: React.CSSProperties;
	render?: (visibleText: string) => React.ReactNode;
	/** Overrides the caret style while this segment is being typed */
	cursorClassName?: string;
}

interface TypewriterTextProps {
	text?: string;
	segments?: TextSegment[];
	className?: string;
	style?: React.CSSProperties;
	speed?: number;
	delay?: number;
	showCursor?: boolean;
	cursorClassName?: string;
}

export function TypewriterText({
	text,
	segments,
	className,
	style,
	speed = 50,
	delay = 500,
	showCursor = true,
	cursorClassName,
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

	// The caret remounts as it moves between segments; only its very first
	// appearance (before any text) grows in from a square dot
	const isFirstAppearance = displayedText.length === 0;

	const renderCursor = (override?: string) =>
		showCursor ? (
			<m.span
				className={
					override ??
					cursorClassName ??
					"inline-block ml-0.5 w-3 -mr-3.5 h-[0.72em] bg-brand"
				}
				style={{ originY: 1 }}
				initial={isFirstAppearance ? { scaleY: 0.13 } : false}
				animate={
					isTypingComplete
						? { opacity: 0, scaleY: 1 }
						: { opacity: 1, scaleY: 1 }
				}
				transition={
					isTypingComplete
						? { duration: 0.25, delay: 0.5 }
						: { scaleY: { duration: 0.35, delay: 0.15, ease: "easeOut" } }
				}
			/>
		) : null;

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
			// The caret lives inside the segment being typed so decorated
			// segments (e.g. corner-brackets) keep it within their box
			const holdsCursor = displayedText.length <= charIndex;

			return (
				<span
					key={segment.text}
					className={segment.className}
					style={segment.style}
				>
					{segment.render ? segment.render(visibleText) : visibleText}
					{holdsCursor && renderCursor(segment.cursorClassName)}
				</span>
			);
		});
	};

	return (
		<span className={className} style={style}>
			{renderText()}
			{(!segments || displayedText.length === 0) && renderCursor()}
		</span>
	);
}
