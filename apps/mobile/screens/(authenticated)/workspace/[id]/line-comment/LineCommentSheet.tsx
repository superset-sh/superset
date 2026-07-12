import * as Crypto from "expo-crypto";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, TextInput, useWindowDimensions, View } from "react-native";
import { Text } from "@/components/ui/text";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import { DiffLineRow } from "../files-changed/components/DiffLineRow";
import {
	contentWidthForChars,
	ESTIMATED_CHAR_WIDTH,
	GUTTER_WIDTH,
	SIGN_WIDTH,
} from "../files-changed/utils/diffMetrics";
import { useCommentComposerStore } from "../stores/commentComposerStore";
import { useDraftCommentsStore } from "../stores/draftCommentsStore";

export function LineCommentSheet() {
	const router = useRouter();
	const { width } = useWindowDimensions();
	const anchor = useCommentComposerStore((state) => state.anchor);
	const closeComposer = useCommentComposerStore((state) => state.closeComposer);
	const addComment = useDraftCommentsStore((state) => state.addComment);
	const updateComment = useDraftCommentsStore((state) => state.updateComment);

	const [body, setBody] = useState(anchor?.initialBody ?? "");
	const trimmed = body.trim();

	const submit = () => {
		if (!anchor || trimmed.length === 0) return;
		if (anchor.editingDraftId) {
			updateComment(anchor.workspaceId, anchor.editingDraftId, trimmed);
		} else {
			addComment(anchor.workspaceId, {
				id: Crypto.randomUUID(),
				path: anchor.path,
				side: anchor.side,
				line: anchor.line,
				lineText: anchor.lineText,
				body: trimmed,
				createdAt: Date.now(),
			});
		}
		closeComposer();
		router.back();
	};

	const codeViewportWidth = width - GUTTER_WIDTH - SIGN_WIDTH;

	return (
		// The scroll view must stay the sheet's only layout child (formSheet
		// cold-mount flex bug); title/toolbar render null into the native bar.
		<>
			<Stack.Screen
				options={{
					title: anchor?.editingDraftId ? "Edit comment" : "Add comment",
				}}
			/>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					icon="xmark"
					accessibilityLabel="Close"
					onPress={() => {
						closeComposer();
						router.back();
					}}
				/>
			</Stack.Toolbar>
			<ScrollView
				className="bg-background flex-1"
				contentInsetAdjustmentBehavior="automatic"
				keyboardShouldPersistTaps="handled"
				contentContainerClassName="pb-10 pt-2"
			>
				{anchor && anchor.lineType !== "file" ? (
					<View className="border-border mx-3 mb-3 overflow-hidden rounded-xl border">
						<DiffLineRow
							row={{
								kind: "line",
								key: "anchor",
								type: anchor.lineType,
								oldLineNumber: anchor.side === "old" ? anchor.line : null,
								newLineNumber: anchor.side === "new" ? anchor.line : null,
								text: anchor.lineText,
								tokens: anchor.tokens,
							}}
							contentWidth={contentWidthForChars(
								anchor.lineText.length,
								ESTIMATED_CHAR_WIDTH,
							)}
							codeViewportWidth={codeViewportWidth}
						/>
					</View>
				) : anchor ? (
					<Text className="text-muted-foreground mx-3 mb-3 font-mono text-[13px]">
						{anchor.path}
					</Text>
				) : null}
				<TextInput
					autoFocus
					className="border-border text-foreground mx-3 min-h-32 rounded-xl border px-3.5 py-3 text-[15px]"
					multiline
					onChangeText={setBody}
					placeholder="Leave a comment…"
					placeholderTextColor="#6b7280"
					value={body}
				/>
				<PressableScale
					className={
						trimmed.length > 0
							? "bg-primary mx-3 mt-3 items-center rounded-xl py-3"
							: "bg-primary/40 mx-3 mt-3 items-center rounded-xl py-3"
					}
					disabled={trimmed.length === 0}
					onPress={submit}
				>
					<Text className="text-primary-foreground font-semibold text-[15px]">
						{anchor?.editingDraftId ? "Save" : "Comment"}
					</Text>
				</PressableScale>
			</ScrollView>
		</>
	);
}
