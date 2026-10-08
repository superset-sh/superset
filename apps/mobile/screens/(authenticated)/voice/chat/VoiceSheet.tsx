import { useLingui } from "@lingui/react/macro";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useVoiceSession } from "@/lib/voice/useVoiceSession";
import { isVoiceActive, useVoiceStore } from "@/lib/voice/voiceStore";
import { VoiceOrb } from "../VoiceLayer/components/VoiceOrb";
import { useVoiceStatusLabel } from "../VoiceLayer/components/VoiceStatusLabel";
import { VoiceTranscript } from "./components/VoiceTranscript";

const ORB_SIZE = 44;

export function VoiceSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const session = useVoiceSession();
	const status = useVoiceStore((state) => state.status);
	const muted = useVoiceStore((state) => state.muted);
	const transcript = useVoiceStore((state) => state.transcript);
	const error = useVoiceStore((state) => state.error);
	const statusLabel = useVoiceStatusLabel(status, muted);
	const scrollRef = useRef<ScrollView>(null);
	const active = isVoiceActive(status);
	const reconnecting = status === "reconnecting";

	useEffect(() => {
		if (!active && router.canGoBack()) router.back();
	}, [active, router]);

	return (
		<>
			<Stack.Screen
				options={{ title: statusLabel || t({ message: "Voice" }) }}
			/>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityLabel={t({ message: "Close" })}
					icon="xmark"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					accessibilityLabel={t({ message: "Voice settings" })}
					icon="slider.horizontal.3"
					onPress={() => router.push("/(authenticated)/voice/settings")}
				/>
			</Stack.Toolbar>
			<Stack.Toolbar placement="bottom">
				<Stack.Toolbar.Button
					accessibilityLabel={
						muted ? t({ message: "Unmute" }) : t({ message: "Mute" })
					}
					icon={muted ? "mic.slash.fill" : "mic.fill"}
					onPress={() => {
						void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						session.toggleMute();
					}}
				/>
				<Stack.Toolbar.Spacer />
				<Stack.Toolbar.View hidesSharedBackground>
					<Pressable
						style={{ width: ORB_SIZE, height: ORB_SIZE }}
						accessibilityRole="button"
						accessibilityLabel={t({ message: "Interrupt" })}
						disabled={status !== "speaking"}
						onPress={() => {
							void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
							session.interrupt();
						}}
					>
						<VoiceOrb status={status} size={ORB_SIZE} />
					</Pressable>
				</Stack.Toolbar.View>
				<Stack.Toolbar.Spacer />
				<Stack.Toolbar.Button
					accessibilityLabel={t({ message: "End voice session" })}
					icon="stop.fill"
					variant="prominent"
					tintColor="#ef4444"
					onPress={() => {
						void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
						session.end();
					}}
				/>
			</Stack.Toolbar>
			<ScrollView
				ref={scrollRef}
				className="bg-background flex-1"
				contentContainerClassName="pb-24 pt-2"
				contentInsetAdjustmentBehavior="automatic"
				onContentSizeChange={() =>
					scrollRef.current?.scrollToEnd({ animated: true })
				}
			>
				{reconnecting || error ? (
					<View
						className={cn(
							"mx-5 mb-2 rounded-xl px-3 py-2",
							error && !reconnecting ? "bg-destructive/15" : "bg-secondary",
						)}
					>
						<Text className="text-muted-foreground text-center text-[13px]">
							{reconnecting
								? t({ message: "Reconnecting… your conversation is kept." })
								: t({ message: "Voice ran into a problem. Try again." })}
						</Text>
					</View>
				) : null}
				{transcript.length === 0 ? (
					<View className="items-center px-10 py-16">
						<Text className="text-muted-foreground text-center text-[15px] leading-[22px]">
							{status === "connecting"
								? t({ message: "Connecting…" })
								: t({
										message:
											"Ask what your agents are up to, or tell one what to do next.",
									})}
						</Text>
					</View>
				) : (
					<VoiceTranscript entries={transcript} />
				)}
			</ScrollView>
		</>
	);
}
