import { requireNativeView } from "expo";
import type { StyleProp, ViewStyle } from "react-native";

/**
 * One row of the anchored menu.
 *
 * `systemImage` is an SF Symbol name, so it is the system's glyph rather than
 * an asset of ours — anything Metro would have to resolve is not a symbol.
 */
export interface SymbolMenuItem {
	id: string;
	title: string;
	systemImage?: string;
}

interface SymbolButtonProps {
	/** SF Symbol name, e.g. `trash`. */
	systemImage: string;
	size?: number;
	tint?: string;
	accessibilityLabel?: string;
	enabled?: boolean;
	/**
	 * Given items the button presents a `UIMenu` anchored to itself and
	 * `onTap` never fires; without them it is a plain button.
	 */
	items?: SymbolMenuItem[];
	onTap?: () => void;
	onSelect?: (event: { nativeEvent: { id: string } }) => void;
	style?: StyleProp<ViewStyle>;
}

const NativeSymbolButton = requireNativeView<SymbolButtonProps>("SymbolButton");

export function SymbolButton({
	onSelect,
	onPress,
	...props
}: Omit<SymbolButtonProps, "onSelect" | "onTap"> & {
	onSelect?: (id: string) => void;
	onPress?: () => void;
}) {
	return (
		<NativeSymbolButton
			{...props}
			onTap={onPress}
			onSelect={(event) => onSelect?.(event.nativeEvent.id)}
		/>
	);
}
