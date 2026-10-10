import { useLingui } from "@lingui/react/macro";
import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import { ChatRowView } from "../components/ChatRowView";
import { useChatActivityStore } from "../stores/chatActivityStore";

const noop = () => {};
const respondNoop = async () => {};

export function ActivitySheet() {
	const { t } = useLingui();
	const router = useRouter();
	const rows = useChatActivityStore((state) => state.rows);
	const texts = useChatActivityStore((state) => state.texts);
	useEffect(() => () => useChatActivityStore.getState().close(), []);

	return (
		<>
			<Stack.Screen options={{ title: t({ message: "Activity" }) }} />
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityLabel={t({ message: "Close" })}
					icon="xmark"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			<ScrollView
				className="bg-background flex-1"
				contentContainerClassName="gap-3 px-4 pb-10 pt-2"
				contentInsetAdjustmentBehavior="automatic"
			>
				{rows.map((row) => (
					<View key={row.key}>
						<ChatRowView
							harness={undefined}
							onDiscardPrompt={noop}
							onLongPressMessage={noop}
							onOpenActivity={noop}
							onRespond={respondNoop}
							onRetryPrompt={noop}
							isLastReply={false}
							row={row}
							text={row.kind === "item" ? (texts[row.item.id] ?? "") : ""}
						/>
					</View>
				))}
			</ScrollView>
		</>
	);
}
