import { requireNativeView } from "expo";
import type { StyleProp, ViewStyle } from "react-native";

export interface SymbolMenuItem {
	id: string;
	title: string;
	systemImage?: string;
}

interface SymbolButtonProps {
	systemImage: string;
	size?: number;
	tint?: string;
	accessibilityLabel?: string;
	enabled?: boolean;
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
