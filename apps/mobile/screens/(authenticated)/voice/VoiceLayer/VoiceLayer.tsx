import { usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useVoiceSession } from "@/lib/voice/useVoiceSession";
import { isVoiceActive, useVoiceStore } from "@/lib/voice/voiceStore";
import { VoiceDock } from "./components/VoiceDock";

const CHAT_PATH = "/voice/chat";

/**
 * Sits above the Stack for the whole signed-in lifetime and draws nothing
 * until a session starts; then the badge. The conversation is a sheet the
 * badge opens. The session itself lives in the store and controller, so
 * navigating never ends it.
 */
export function VoiceLayer() {
	const session = useVoiceSession();
	const router = useRouter();
	const pathname = usePathname();
	const status = useVoiceStore((state) => state.status);
	const muted = useVoiceStore((state) => state.muted);
	const focusLabel = useVoiceStore((state) => state.focusLabel);
	const active = isVoiceActive(status);
	const chatOpen = pathname === CHAT_PATH;

	// The layer lives exactly as long as the signed-in app does.
	const endSession = session.end;
	useEffect(() => () => endSession(), [endSession]);

	if (!active) return null;

	return (
		<View style={StyleSheet.absoluteFill} pointerEvents="box-none">
			<VoiceDock
				status={status}
				muted={muted}
				focusLabel={focusLabel}
				onExpand={() => {
					if (chatOpen) router.back();
					else router.push("/(authenticated)/voice/chat");
				}}
				onToggleMute={session.toggleMute}
				onEnd={session.end}
			/>
		</View>
	);
}
