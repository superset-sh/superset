import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import type { CommentIntent } from "@superset/shared/page-comments";
import { ThumbsUp, Trash2, Zap } from "lucide-react-native";
import { View } from "react-native";
import { APPROVE_BODY, DELETE_BODY } from "../CommentComposer/constants";
import { ComposerActionButton } from "./components/ComposerActionButton";

interface ComposerActionsProps {
	disabled?: boolean;
	onQuick: (body: MessageDescriptor, intent: CommentIntent) => void;
	onOpenPresets: () => void;
}

export function ComposerActions({
	disabled = false,
	onQuick,
	onOpenPresets,
}: ComposerActionsProps) {
	const { t } = useLingui();

	return (
		<View className="flex-row items-center gap-1">
			<ComposerActionButton
				icon={Trash2}
				label={t({ message: "Ask for this to be removed" })}
				disabled={disabled}
				onPress={() => onQuick(DELETE_BODY, "delete")}
			/>
			<ComposerActionButton
				icon={Zap}
				label={t({ message: "Quick feedback" })}
				disabled={disabled}
				onPress={onOpenPresets}
			/>
			<ComposerActionButton
				icon={ThumbsUp}
				label={t({ message: "Looks good" })}
				disabled={disabled}
				onPress={() => onQuick(APPROVE_BODY, "approve")}
			/>
		</View>
	);
}
