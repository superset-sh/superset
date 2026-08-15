import { Button, HStack, Image, ScrollView, Text } from "@expo/ui/swift-ui";
import {
	buttonBorderShape,
	buttonStyle,
	font,
	frame,
	scrollIndicators,
	tint,
} from "@expo/ui/swift-ui/modifiers";
import { FOREGROUND } from "@/screens/(authenticated)/components/GlassComposer";
import { QUICK_KEYS, type TerminalQuickKey } from "../../constants";

interface QuickKeysRowProps {
	onKey: (key: TerminalQuickKey) => void;
}

/**
 * Quick-key chips above the composer pill — esc/tab/arrows the soft keyboard
 * lacks. SwiftUI rather than React Native on purpose: rendered inside the
 * composer's `Host`, the gap to the pill is one SwiftUI stack spacing that
 * tracks the glass exactly. As RN siblings the gap was a hardcoded guess at a
 * height `Host matchContents` under-reports, so it drifted whenever the pill
 * grew (attachments, extra lines) and animated on a different curve.
 */
export function QuickKeysRow({ onKey }: QuickKeysRowProps) {
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
