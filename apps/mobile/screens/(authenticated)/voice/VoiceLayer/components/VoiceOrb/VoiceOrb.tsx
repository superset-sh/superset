import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Rive, { Fit, type RiveRef } from "rive-react-native";
import type { VoiceStatus } from "@/lib/voice/voiceStore";

const STATE_MACHINE = "default";
const INPUTS = ["listening", "thinking", "speaking", "asleep"] as const;
type PersonaInput = (typeof INPUTS)[number];

function personaInput(status: VoiceStatus): PersonaInput | null {
	switch (status) {
		case "listening":
		case "thinking":
		case "speaking":
			return status;
		case "connecting":
		case "reconnecting":
			return "thinking";
		case "ended":
			return "asleep";
		case "idle":
			return null;
	}
}

export function VoiceOrb({
	status,
	size,
}: {
	status: VoiceStatus;
	size: number;
}) {
	const rive = useRef<RiveRef>(null);
	const [playing, setPlaying] = useState(false);

	useEffect(() => {
		if (!playing) return;
		const active = personaInput(status);
		for (const input of INPUTS) {
			rive.current?.setInputState(STATE_MACHINE, input, input === active);
		}
	}, [status, playing]);

	return (
		<View style={{ width: size, height: size }} accessibilityElementsHidden>
			<Rive
				ref={rive}
				source={require("@/assets/voice/opal.riv")}
				stateMachineName={STATE_MACHINE}
				fit={Fit.Contain}
				autoplay
				onPlay={() => setPlaying(true)}
				style={{ width: size, height: size }}
			/>
		</View>
	);
}
