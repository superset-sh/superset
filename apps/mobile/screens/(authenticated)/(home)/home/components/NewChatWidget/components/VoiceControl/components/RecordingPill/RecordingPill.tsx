import { Button, HStack, Image, Text } from "@expo/ui/swift-ui";
import {
	buttonBorderShape,
	buttonStyle,
	frame,
	monospacedDigit,
	padding,
	tint,
} from "@expo/ui/swift-ui/modifiers";
import { useEffect, useState } from "react";
import { FOREGROUND } from "../../../../constants";
import { VoiceLevelBars } from "./components/VoiceLevelBars";

function formatElapsed(startedAt: number, now: number) {
	const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function RecordingPill({
	startedAt,
	onStop,
}: {
	startedAt: number;
	onStop: () => void;
}) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(interval);
	}, []);

	return (
		<Button
			onPress={onStop}
			modifiers={[
				buttonStyle("bordered"),
				buttonBorderShape("capsule"),
				tint(FOREGROUND),
			]}
		>
			<HStack
				spacing={8}
				modifiers={[frame({ height: 26 }), padding({ horizontal: 2 })]}
			>
				<Image systemName="stop.fill" size={12} />
				<Text modifiers={[monospacedDigit()]}>
					{formatElapsed(startedAt, now)}
				</Text>
				<VoiceLevelBars />
			</HStack>
		</Button>
	);
}
