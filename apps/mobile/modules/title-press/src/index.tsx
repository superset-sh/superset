import { requireNativeView } from "expo";

interface NativeTitlePressProps {
	onTitlePress: () => void;
	style: { width: number; height: number };
}

const NativeTitlePress = requireNativeView<NativeTitlePressProps>("TitlePress");

/** Reports taps on the enclosing native stack screen's title. */
export function TitlePress({ onPress }: { onPress: () => void }) {
	return (
		<NativeTitlePress onTitlePress={onPress} style={{ width: 0, height: 0 }} />
	);
}
