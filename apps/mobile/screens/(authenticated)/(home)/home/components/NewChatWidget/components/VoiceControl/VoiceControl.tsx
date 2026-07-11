import { Button, Image } from "@expo/ui/swift-ui";
import {
	buttonBorderShape,
	buttonStyle,
	frame,
	tint,
} from "@expo/ui/swift-ui/modifiers";
import { FOREGROUND } from "../../constants";
import type { VoiceDictation } from "../../hooks/useVoiceDictation";
import { FinalizingChip } from "./components/FinalizingChip";
import { RecordingPill } from "./components/RecordingPill";

export function VoiceControl({ dictation }: { dictation: VoiceDictation }) {
	if (dictation.status === "recording") {
		return (
			<RecordingPill startedAt={dictation.startedAt} onStop={dictation.stop} />
		);
	}
	if (dictation.status === "finalizing") {
		return <FinalizingChip />;
	}
	return (
		<Button
			onPress={() => void dictation.start()}
			modifiers={[
				buttonStyle("bordered"),
				buttonBorderShape("circle"),
				tint(FOREGROUND),
			]}
		>
			<Image
				systemName="mic"
				size={16}
				modifiers={[frame({ width: 26, height: 26 })]}
			/>
		</Button>
	);
}
