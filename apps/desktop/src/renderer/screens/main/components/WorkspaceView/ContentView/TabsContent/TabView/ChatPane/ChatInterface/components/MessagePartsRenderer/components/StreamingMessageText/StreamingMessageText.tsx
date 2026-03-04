import {
	MessageResponse,
	type MessageResponseProps,
} from "@superset/ui/ai-elements/message";
import { useEffect, useState } from "react";

const STREAM_TEXT_TICK_MS = 16;
const STREAM_TEXT_CHARS_PER_TICK = 2;

interface StreamingMessageTextProps {
	text: string;
	isAnimating: boolean;
	mermaid: MessageResponseProps["mermaid"];
	components?: MessageResponseProps["components"];
}

export function StreamingMessageText({
	text,
	isAnimating,
	mermaid,
	components,
}: StreamingMessageTextProps) {
	const [displayText, setDisplayText] = useState(text);

	useEffect(() => {
		if (!isAnimating) {
			setDisplayText(text);
			return;
		}

		setDisplayText((previous) => (text.startsWith(previous) ? previous : text));

		const intervalId = window.setInterval(() => {
			setDisplayText((previous) => {
				if (previous.length >= text.length) return previous;
				const nextLength = Math.min(
					text.length,
					previous.length + STREAM_TEXT_CHARS_PER_TICK,
				);
				return text.slice(0, nextLength);
			});
		}, STREAM_TEXT_TICK_MS);

		return () => window.clearInterval(intervalId);
	}, [text, isAnimating]);

	return (
		<MessageResponse
			animated={false}
			isAnimating={isAnimating}
			mermaid={mermaid}
			components={components}
		>
			{displayText}
		</MessageResponse>
	);
}
