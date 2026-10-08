import { useLingui } from "@lingui/react/macro";
import { Text } from "@/components/ui/text";
import type { VoiceStatus } from "@/lib/voice/voiceStore";

export function useVoiceStatusLabel(
	status: VoiceStatus,
	muted: boolean,
): string {
	const { t } = useLingui();
	if (muted && (status === "listening" || status === "thinking")) {
		return t({ message: "Muted" });
	}
	switch (status) {
		case "connecting":
			return t({ message: "Connecting…" });
		case "listening":
			return t({ message: "Listening" });
		case "thinking":
			return t({ message: "Thinking" });
		case "speaking":
			return t({ message: "Speaking" });
		case "reconnecting":
			return t({ message: "Reconnecting…" });
		case "ended":
			return t({ message: "Ended" });
		case "idle":
			return "";
	}
}

export function VoiceStatusLabel({
	status,
	muted,
	className,
}: {
	status: VoiceStatus;
	muted: boolean;
	className?: string;
}) {
	const label = useVoiceStatusLabel(status, muted);
	return <Text className={className}>{label}</Text>;
}
