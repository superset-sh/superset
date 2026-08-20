import { Button, HStack, Image, ScrollView, Text } from "@expo/ui/swift-ui";
import {
	buttonBorderShape,
	buttonStyle,
	font,
	foregroundColor,
	frame,
	scrollIndicators,
	tint,
} from "@expo/ui/swift-ui/modifiers";
import { FOREGROUND } from "@/screens/(authenticated)/components/GlassComposer";
import { QUICK_KEYS, type TerminalQuickKey } from "../../constants";

export interface QuickKeysSelectActions {
	hasSelection: boolean;
	onCopy: () => void;
}

interface QuickKeysRowProps {
	onKey: (key: TerminalQuickKey) => void;
	/** Terminal select mode: the row shows a centered Copy Selection button
	 *  instead of the keys. Exits need no button of their own — copying
	 *  exits, and so does deselecting (the page auto-leaves select mode). */
	select?: QuickKeysSelectActions | null;
}

/**
 * Quick-key chips above the composer pill — esc/tab/arrows the soft keyboard
 * lacks. SwiftUI rather than React Native on purpose: rendered inside the
 * composer's `Host`, the gap to the pill is one SwiftUI stack spacing that
 * tracks the glass exactly. As RN siblings the gap was a hardcoded guess at a
 * height `Host matchContents` under-reports, so it drifted whenever the pill
 * grew (attachments, extra lines) and animated on a different curve.
 */
export function QuickKeysRow({ onKey, select }: QuickKeysRowProps) {
	if (select) {
		return (
			<HStack modifiers={[frame({ maxWidth: 100_000 })]}>
				{select.hasSelection ? (
					<Button
						onPress={select.onCopy}
						modifiers={[
							buttonStyle("glassProminent"),
							buttonBorderShape("capsule"),
							// White fill + explicit dark label, like the send button:
							// prominent styles keep white text even on a light tint.
							tint("#ffffff"),
						]}
					>
						<Text
							modifiers={[
								font({ size: 14, weight: "semibold" }),
								foregroundColor("#1c1c1e"),
							]}
						>
							Copy Selection
						</Text>
					</Button>
				) : null}
			</HStack>
		);
	}
	return (
		<ScrollView
			axes="horizontal"
			modifiers={[scrollIndicators("hidden", "horizontal")]}
		>
			<HStack spacing={8}>
				{QUICK_KEYS.map((key) => (
					<Button
						key={key.id}
						onPress={() => onKey(key)}
						modifiers={[
							buttonStyle("bordered"),
							buttonBorderShape("roundedRectangle", 10),
							tint(FOREGROUND),
						]}
					>
						{key.symbol ? (
							<Image
								systemName={key.symbol}
								size={13}
								modifiers={[frame({ width: 24, height: 17 })]}
							/>
						) : (
							<Text
								modifiers={[
									font({ size: 12, design: "monospaced" }),
									frame({ minWidth: 24, height: 17 }),
								]}
							>
								{key.label ?? ""}
							</Text>
						)}
					</Button>
				))}
			</HStack>
		</ScrollView>
	);
}
