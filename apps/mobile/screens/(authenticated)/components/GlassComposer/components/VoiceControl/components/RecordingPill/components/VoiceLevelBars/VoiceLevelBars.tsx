import { Capsule, HStack } from "@expo/ui/swift-ui";
import {
	Animation,
	animation,
	foregroundStyle,
	frame,
} from "@expo/ui/swift-ui/modifiers";
import { useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useState } from "react";
import { FOREGROUND } from "../../../../../../constants";

const BAR_COUNT = 5;
const BAR_WIDTH = 3;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 14;

export function VoiceLevelBars() {
	const [levels, setLevels] = useState<number[]>(() =>
		Array.from({ length: BAR_COUNT }, () => 0),
	);
	const [tick, setTick] = useState(0);

	useSpeechRecognitionEvent("volumechange", (event) => {
		const level = Math.min(1, Math.max(0, (event.value + 2) / 8));
		setLevels((previous) => [...previous.slice(1), level]);
		setTick((previous) => previous + 1);
	});

	return (
		<HStack
			spacing={2.5}
			modifiers={[animation(Animation.linear({ duration: 0.1 }), tick)]}
		>
			{levels.map((level, index) => (
				<Capsule
					// biome-ignore lint/suspicious/noArrayIndexKey: bars are positional
					key={index}
					modifiers={[
						frame({
							width: BAR_WIDTH,
							height: MIN_HEIGHT + level * (MAX_HEIGHT - MIN_HEIGHT),
						}),
						foregroundStyle(FOREGROUND),
						frame({
							width: BAR_WIDTH,
							height: MAX_HEIGHT,
							alignment: "bottom",
						}),
					]}
				/>
			))}
		</HStack>
	);
}
