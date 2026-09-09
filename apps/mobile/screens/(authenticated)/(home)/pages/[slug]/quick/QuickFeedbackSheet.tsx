import { i18n } from "@superset/i18n";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { QUICK_PRESETS } from "../components/SelectionToolbar";
import { usePageCommentActions } from "../hooks/usePageComments";
import { usePageCommentStore } from "../stores/pageCommentStore";

export function QuickFeedbackSheet() {
	const router = useRouter();
	const { pageId, version, anchor } = usePageCommentStore();
	const clear = usePageCommentStore((state) => state.clear);
	const { createThread } = usePageCommentActions(pageId ?? undefined);

	const pick = async (body: string) => {
		if (!version || !anchor) return;
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		router.back();
		await createThread.mutateAsync({ version, anchor, body });
		clear();
	};

	return (
		<ScrollView
			className="bg-background flex-1"
			contentInsetAdjustmentBehavior="automatic"
		>
			<View className="px-4 py-2">
				{QUICK_PRESETS.map((preset) => {
					const label = i18n._(preset.body);
					return (
						<Pressable
							key={preset.id}
							accessibilityRole="button"
							onPress={() => void pick(label)}
							className="min-h-11 flex-row items-center gap-3 rounded-xl px-2 py-3 active:opacity-60"
						>
							<Icon
								as={preset.icon}
								className="text-muted-foreground size-4.5"
							/>
							<Text className="text-[15px]">{label}</Text>
						</Pressable>
					);
				})}
			</View>
		</ScrollView>
	);
}
