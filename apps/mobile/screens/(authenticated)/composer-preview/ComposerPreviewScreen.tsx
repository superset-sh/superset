import {
	Composer,
	type ComposerBackdrop,
	type ComposerHandle,
} from "@superset/composer";
import { useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import { useAttachmentsSheet } from "@/screens/(authenticated)/components/GlassComposer/hooks/useAttachmentsSheet";

/**
 * Development scaffolding for the native composer rewrite — not linked from
 * anywhere, reachable only by deep link
 * (`superset://composer-preview`). Deleted when the composer cuts over to the
 * real surfaces. See `plans/20260821-native-composer.md`.
 *
 * The rows exist to prove touch passthrough: the composer's overlay covers this
 * whole screen, so every row below it must still register a tap.
 */
export function ComposerPreviewScreen() {
	const [tapped, setTapped] = useState<string | null>(null);
	const [lastEvent, setLastEvent] = useState<string | null>(null);
	const composerRef = useRef<ComposerHandle>(null);
	// The native attachments sheet already exists (#6688) and the tray is a
	// shared context, so `+` can do something real before the composer grows its
	// own carousel in milestone 5.
	// Driven by the route rather than a sticky toggle: a toggle persists across
	// navigations (re-opening the same route does not remount it), which silently
	// changes dismissal behaviour for anything driving the screen afterwards.
	const params = useLocalSearchParams<{ backdrop?: string }>();
	const backdrop: ComposerBackdrop =
		params.backdrop === "passthrough" ? "passthrough" : "dim";
	const openAttachmentsSheet = useAttachmentsSheet();
	const attachments = usePromptInputAttachments();

	return (
		<View className="flex-1 bg-background">
			<ScrollView
				className="flex-1"
				// The overlay occupies no layout space, so the list reserves room
				// for the collapsed pill itself.
				contentContainerClassName="px-4 pt-16 pb-32 gap-3"
			>
				<Text className="text-2xl font-semibold text-foreground">
					Composer preview
				</Text>
				<Text className="text-sm text-muted-foreground">
					{tapped ? `Last tapped: ${tapped}` : "Tap a row to test passthrough"}
				</Text>
				<Text className="text-sm text-muted-foreground">
					{lastEvent ? `Composer event: ${lastEvent}` : "No composer event yet"}
				</Text>
				<Text className="text-sm text-muted-foreground">
					{`Attachments in tray: ${attachments.attachments.length}`}
				</Text>
				<Text className="text-sm text-muted-foreground">
					{`backdrop: ${backdrop} — open ?backdrop=passthrough to scroll while typing`}
				</Text>
				{Array.from({ length: 20 }, (_, index) => `Row ${index + 1}`).map(
					(label) => (
						<Pressable
							key={label}
							onPress={() => setTapped(label)}
							className="rounded-xl border border-border px-4 py-4"
						>
							<Text className="text-foreground">{label}</Text>
						</Pressable>
					),
				)}
			</ScrollView>
			{/* Deliberately not the real placeholder — the home screen's composer
			    uses that, and these need telling apart when driving the app. */}
			<Composer
				ref={composerRef}
				backdrop={backdrop}
				placeholder="Native composer"
				onSubmit={(text) => {
					setLastEvent(`submit "${text}"`);
					// Mirrors the real contract: the caller clears only once its own
					// delivery succeeded.
					composerRef.current?.clear();
				}}
				onAttachmentsPress={() => {
					setLastEvent("attachments");
					// Presenting the sheet resigns first responder, which collapses the
					// composer. Re-open it once the sheet is gone so the keyboard and
					// the draft come back together.
					openAttachmentsSheet();
					composerRef.current?.focus();
				}}
				onDictatePress={() => setLastEvent("dictate")}
				onModelPress={() => setLastEvent("model")}
			/>
		</View>
	);
}
