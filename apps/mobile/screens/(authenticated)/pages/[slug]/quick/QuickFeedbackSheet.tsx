import { useLingui } from "@lingui/react/macro";
import { usePageComments } from "@superset/cloud-client";
import { i18n } from "@superset/i18n";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { errorCopy } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { QUICK_PRESETS } from "../components/CommentComposer/constants";
import { usePageCommentUser } from "../hooks/usePageCommentUser";
import { usePageCommentStore } from "../stores/pageCommentStore";

export function QuickFeedbackSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const { pageId, version, anchor } = usePageCommentStore();
	const clear = usePageCommentStore((state) => state.clear);
	const user = usePageCommentUser();
	const store = usePageComments({
		pageId: pageId ?? "",
		version: version ?? 0,
		user,
	});

	const pick = async (body: string) => {
		if (!version || !anchor || store.submitting) return;
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		try {
			await store.createThread({ anchor, anchorText: anchor.text, body });
		} catch (error) {
			Alert.alert(t({ message: "Comment not posted" }), errorCopy(error));
			return;
		}
		clear();
		router.back();
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
				contentInsetAdjustmentBehavior="automatic"
			>
				<View className="px-4 py-2">
					{QUICK_PRESETS.map((preset) => {
						const label = i18n._(preset.body);
						return (
							<Pressable
								key={preset.id}
								accessibilityRole="button"
								disabled={store.submitting}
								onPress={() => void pick(label)}
								className={cn(
									"min-h-11 flex-row items-center gap-3 rounded-xl px-2 py-3 active:opacity-60",
									store.submitting && "opacity-50",
								)}
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
		</>
	);
}
