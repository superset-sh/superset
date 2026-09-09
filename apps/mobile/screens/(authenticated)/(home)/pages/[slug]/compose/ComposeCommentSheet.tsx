import { useLingui } from "@lingui/react/macro";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { Text } from "@/components/ui/text";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import { usePageCommentActions } from "../hooks/usePageComments";
import { usePageCommentStore } from "../stores/pageCommentStore";

export function ComposeCommentSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const [body, setBody] = useState("");
	const pageId = usePageCommentStore((state) => state.pageId);
	const version = usePageCommentStore((state) => state.version);
	const anchor = usePageCommentStore((state) => state.anchor);
	const clear = usePageCommentStore((state) => state.clear);
	const { createThread } = usePageCommentActions(pageId ?? undefined);
	const trimmed = body.trim();

	const submit = async () => {
		if (trimmed.length === 0 || !version || !anchor) return;
		await createThread.mutateAsync({ version, anchor, body: trimmed });
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
				keyboardShouldPersistTaps="handled"
				contentContainerClassName="pb-10 pt-2"
			>
				{anchor?.text ? (
					<View className="border-border mx-3 mb-3 border-l-2 pl-2">
						<Text
							className="text-muted-foreground text-[13px]"
							numberOfLines={4}
						>
							{anchor.text}
						</Text>
					</View>
				) : null}

				<TextInput
					autoFocus
					className="border-border text-foreground mx-3 min-h-32 rounded-xl border px-3.5 py-3 text-[15px]"
					multiline
					onChangeText={setBody}
					placeholder={t({ message: "Write a comment" })}
					placeholderTextColor="#6b7280"
					value={body}
				/>

				<PressableScale
					className={
						trimmed.length > 0
							? "bg-primary mx-3 mt-3 items-center rounded-xl py-3"
							: "bg-primary/40 mx-3 mt-3 items-center rounded-xl py-3"
					}
					disabled={trimmed.length === 0 || createThread.isPending}
					onPress={() => void submit()}
				>
					<Text className="text-primary-foreground font-semibold text-[15px]">
						{t({ message: "Post" })}
					</Text>
				</PressableScale>
			</ScrollView>
		</>
	);
}
