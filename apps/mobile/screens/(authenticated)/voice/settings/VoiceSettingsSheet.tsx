import { useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import {
	VOICE_REASONING_EFFORTS,
	VOICE_SPEEDS,
	VOICE_VOICES,
	type VoiceReasoningEffort,
} from "@superset/shared/voice";
import { Stack, useRouter } from "expo-router";
import { ScrollView } from "react-native";
import { useVoiceSession } from "@/lib/voice/useVoiceSession";
import { useVoiceStore } from "@/lib/voice/voiceStore";
import { OptionChips } from "./components/OptionChips";

export function VoiceSettingsSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const session = useVoiceSession();
	const voice = useVoiceStore((state) => state.voice);
	const reasoningEffort = useVoiceStore((state) => state.reasoningEffort);
	const speed = useVoiceStore((state) => state.speed);
	const setVoice = useVoiceStore((state) => state.setVoice);
	const setReasoningEffort = useVoiceStore((state) => state.setReasoningEffort);
	const setSpeed = useVoiceStore((state) => state.setSpeed);

	const effortLabels: Record<VoiceReasoningEffort, string> = {
		minimal: t({ message: "Minimal" }),
		low: t({ message: "Low" }),
		medium: t({ message: "Medium" }),
		high: t({ message: "High" }),
		xhigh: t({ message: "Extra high" }),
	};

	return (
		<>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityLabel={t({ message: "Close" })}
					icon="xmark"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			<ScrollView
				className="bg-background flex-1"
				contentContainerClassName="gap-7 px-5 pb-10 pt-3"
				contentInsetAdjustmentBehavior="automatic"
			>
				<OptionChips
					title={t({ message: "Reasoning" })}
					options={VOICE_REASONING_EFFORTS.map((value) => ({
						value,
						label: effortLabels[value],
					}))}
					value={reasoningEffort}
					onChange={(value) => {
						setReasoningEffort(value);
						session.applyLiveSettings();
					}}
				/>
				<OptionChips
					title={t({ message: "Speed" })}
					options={VOICE_SPEEDS.map((value) => ({
						value,
						label: `${formatNumber(value)}×`,
					}))}
					value={speed}
					onChange={(value) => {
						setSpeed(value);
						session.applyLiveSettings();
					}}
				/>
				<OptionChips
					title={t({ message: "Voice" })}
					options={VOICE_VOICES.map((value) => ({
						value,
						label: value.charAt(0).toUpperCase() + value.slice(1),
					}))}
					value={voice}
					onChange={(value) => {
						setVoice(value);
						session.restart();
					}}
				/>
			</ScrollView>
		</>
	);
}
