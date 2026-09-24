import { Button, Host, HStack, Image, Menu, Spacer } from "@expo/ui/swift-ui";
import {
	accessibilityLabel,
	disabled as disabledModifier,
} from "@expo/ui/swift-ui/modifiers";
import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import type { CommentIntent } from "@superset/shared/page-comments";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import {
	APPROVE_BODY,
	DELETE_BODY,
	QUICK_PRESETS,
} from "../CommentComposer/constants";

const GLYPH = 20;
const ROW = 36;

interface QuickRepliesProps {
	disabled: boolean;
	onQuick: (body: MessageDescriptor, intent: CommentIntent) => void;
	onPreset: (body: string) => void;
}

export function QuickReplies({
	disabled,
	onQuick,
	onPreset,
}: QuickRepliesProps) {
	const { t } = useLingui();
	const theme = useTheme();
	const tap = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

	return (
		<Host style={{ height: ROW, opacity: disabled ? 0.5 : 1 }}>
			<HStack spacing={26}>
				<Button
					modifiers={[
						disabledModifier(disabled),
						accessibilityLabel(
							t({ message: "Delete this", context: "quick reply button" }),
						),
					]}
					onPress={() => {
						tap();
						onQuick(DELETE_BODY, "delete");
					}}
				>
					<Image
						systemName="trash"
						size={GLYPH}
						color={theme.mutedForeground}
					/>
				</Button>

				<Button
					modifiers={[
						disabledModifier(disabled),
						accessibilityLabel(
							t({ message: "Looks good", context: "quick reply button" }),
						),
					]}
					onPress={() => {
						tap();
						onQuick(APPROVE_BODY, "approve");
					}}
				>
					<Image
						systemName="hand.thumbsup"
						size={GLYPH}
						color={theme.mutedForeground}
					/>
				</Button>

				<Menu
					modifiers={[
						disabledModifier(disabled),
						accessibilityLabel(
							t({ message: "Quick feedback", context: "quick reply button" }),
						),
					]}
					label={
						<Image
							systemName="ellipsis"
							size={GLYPH}
							color={theme.mutedForeground}
						/>
					}
				>
					{QUICK_PRESETS.map((preset) => (
						<Button
							key={preset.id}
							modifiers={[disabledModifier(disabled)]}
							label={i18n._(preset.body)}
							onPress={() => {
								tap();
								onPreset(i18n._(preset.body));
							}}
						/>
					))}
				</Menu>

				<Spacer />
			</HStack>
		</Host>
	);
}
