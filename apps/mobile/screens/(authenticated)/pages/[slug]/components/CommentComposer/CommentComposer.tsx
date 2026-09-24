import { useLingui } from "@lingui/react/macro";
import * as Haptics from "expo-haptics";
import { ArrowUp } from "lucide-react-native";
import {
	forwardRef,
	type ReactNode,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/useTheme";
import { errorCopy } from "@/lib/errors";
import { cn } from "@/lib/utils";

export interface CommentComposerHandle {
	focus: () => void;
}

interface CommentComposerProps {
	placeholder: string;
	autoFocus?: boolean;
	pending?: boolean;
	actions?: ReactNode;
	onSubmit: (body: string) => Promise<void>;
}

export const CommentComposer = forwardRef<
	CommentComposerHandle,
	CommentComposerProps
>(function CommentComposer(
	{ placeholder, autoFocus = false, pending = false, actions, onSubmit },
	ref,
) {
	const { t } = useLingui();
	const theme = useTheme();
	const inputRef = useRef<TextInput>(null);
	const [body, setBody] = useState("");
	const trimmed = body.trim();
	const canSend = trimmed.length > 0 && !pending;

	useImperativeHandle(ref, () => ({
		focus: () => inputRef.current?.focus(),
	}));

	const send = async () => {
		if (!canSend) return;
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		try {
			await onSubmit(trimmed);
			setBody("");
		} catch (error) {
			Alert.alert(t({ message: "Comment not posted" }), errorCopy(error));
		}
	};

	return (
		<View className="gap-1">
			<TextInput
				ref={inputRef}
				value={body}
				onChangeText={setBody}
				autoFocus={autoFocus}
				multiline
				placeholder={placeholder}
				placeholderTextColor={theme.mutedForeground}
				selectionColor={theme.foreground}
				className="text-foreground max-h-28 min-h-9 text-[16px]"
			/>

			<View className="flex-row items-center justify-between">
				<View className="flex-1">{actions}</View>

				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t({ message: "Post" })}
					disabled={!canSend}
					onPress={() => void send()}
					hitSlop={6}
					className={cn(
						"size-8 shrink-0 items-center justify-center rounded-full",
						canSend ? "bg-primary" : "bg-foreground/15",
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
});
