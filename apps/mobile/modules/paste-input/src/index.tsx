import { requireNativeView } from "expo";
import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";

export interface PastedImage {
	uri: string;
	width: number;
	height: number;
}

export interface PasteImagesEvent {
	nativeEvent: { images: PastedImage[] };
}

const NativePasteInputView = requireNativeView("PasteInput");

/** Offers Paste in a wrapped text input's edit menu when the clipboard holds images. */
export function PasteInputView(
	props: PropsWithChildren<{
		style?: StyleProp<ViewStyle>;
		enabled?: boolean;
		onPasteImages: (event: PasteImagesEvent) => void;
	}>,
) {
	return <NativePasteInputView {...props} />;
}
