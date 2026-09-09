import { useLingui } from "@lingui/react/macro";
import { getInitials } from "@superset/shared/names";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { ArrowUp } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useSession } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

/**
 * The composer the rest of the app uses, at comment scale: your avatar, a
 * single pill that grows with the text, and a send button that only lights up
 * when there is something to send. No quoted anchor — the block itself is
 * still outlined on the page behind this sheet, which says it better.
 */
export function CommentComposer({
	placeholder,
	autoFocus = false,
	pending = false,
	onSubmit,
}: {
	placeholder: string;
	autoFocus?: boolean;
	pending?: boolean;
	onSubmit: (body: string) => Promise<void>;
}) {
	const { t } = useLingui();
	const { data: session } = useSession();
	const [body, setBody] = useState("");
	const trimmed = body.trim();
	const canSend = trimmed.length > 0 && !pending;

	const send = async () => {
		if (!canSend) return;
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		setBody("");
		await onSubmit(trimmed).catch(() => setBody(trimmed));
	};

	return (
		<View className="flex-row items-end gap-2.5">
			<View className="bg-muted size-8 shrink-0 items-center justify-center overflow-hidden rounded-full">
				{session?.user.image ? (
					<Image
						source={{ uri: session.user.image }}
						style={{ height: "100%", width: "100%" }}
						contentFit="cover"
					/>
				) : (
					<Text className="text-muted-foreground text-[11px] font-medium">
						{getInitials(session?.user.name) || "?"}
					</Text>
				)}
			</View>

			<View className="border-border min-h-10 flex-1 flex-row items-center gap-2 rounded-3xl border px-4 py-1.5">
				<TextInput
					value={body}
					onChangeText={setBody}
					autoFocus={autoFocus}
					multiline
					placeholder={placeholder}
					placeholderTextColor="#6b7280"
					className="text-foreground max-h-28 flex-1 py-1 text-[15px]"
				/>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t({ message: "Post" })}
					disabled={!canSend}
					onPress={() => void send()}
					hitSlop={6}
					className={cn(
						"size-7 shrink-0 items-center justify-center rounded-full",
						canSend ? "bg-primary" : "bg-muted",
					)}
				>
					<Icon
						as={ArrowUp}
						className={cn(
							"size-4",
							canSend ? "text-primary-foreground" : "text-muted-foreground",
						)}
					/>
				</Pressable>
			</View>
		</View>
	);
}
