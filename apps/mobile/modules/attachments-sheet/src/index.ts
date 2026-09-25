import { requireOptionalNativeModule } from "expo";
import { processColor } from "react-native";

export type AttachmentsSheetAction = "photos" | "camera" | "files";

export interface AttachmentsSheetAsset {
	uri: string;
	name: string;
	mediaType: string;
	size: number;
}

export interface AttachmentsSheetTheme {
	colorScheme: "light" | "dark";
	background: string;
	foreground: string;
	mutedForeground: string;
	border: string;
	secondary: string;
	secondaryForeground: string;
	primary: string;
	primaryForeground: string;
}

export interface AttachmentsSheetHandlers {
	onAddAssets: (assets: AttachmentsSheetAsset[]) => void;
	onAction: (action: AttachmentsSheetAction) => void;
	/** Dismissed with neither assets nor a row action. */
	onDismiss?: () => void;
}

type AttachmentsSheetEvents = {
	onAddAssets: (event: { assets: AttachmentsSheetAsset[] }) => void;
	onAction: (event: { action: AttachmentsSheetAction }) => void;
	onDismiss: () => void;
};

// expo-modules-core 56.0.23 exports a broken `NativeModule` type alias (the
// constructor type, generic dropped), so the emitter surface is typed by hand.
type AttachmentsSheetNativeModule = {
	present(options: Record<string, number | string>): Promise<boolean>;
	addListener<Name extends keyof AttachmentsSheetEvents>(
		eventName: Name,
		listener: AttachmentsSheetEvents[Name],
	): { remove(): void };
};

const AttachmentsSheet =
	requireOptionalNativeModule<AttachmentsSheetNativeModule>("AttachmentsSheet");

/**
 * Presents the native attachments sheet. Every presentation ends in exactly
 * one native event — assets added, a row action, or a plain dismissal — after
 * which the listeners tear themselves down.
 */
export async function presentAttachmentsSheet(
	theme: AttachmentsSheetTheme,
	handlers: AttachmentsSheetHandlers,
): Promise<boolean> {
	if (!AttachmentsSheet) {
		console.warn(
			"AttachmentsSheet native module unavailable — rebuild the dev client",
		);
		return false;
	}
	const subscriptions = [
		AttachmentsSheet.addListener("onAddAssets", ({ assets }) => {
			settle();
			handlers.onAddAssets(assets);
		}),
		AttachmentsSheet.addListener("onAction", ({ action }) => {
			settle();
			handlers.onAction(action);
		}),
		AttachmentsSheet.addListener("onDismiss", () => {
			settle();
			handlers.onDismiss?.();
		}),
	];
	const settle = () => {
		for (const subscription of subscriptions) subscription.remove();
	};

	const { colorScheme, ...colors } = theme;
	const presented = await AttachmentsSheet.present({
		colorScheme,
		...Object.fromEntries(
			Object.entries(colors).map(([token, value]) => [
				token,
				(processColor(value) as number | null) ?? 0,
			]),
		),
	});
	if (!presented) settle();
	return presented;
}
