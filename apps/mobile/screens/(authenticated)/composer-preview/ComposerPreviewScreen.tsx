import {
	Composer,
	type ComposerBackdrop,
	type ComposerHandle,
} from "@superset/composer";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import { useAgentIconUri } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/hooks/useAgentIconUri";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";
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
	// The route seeds it so a driver can pick a mode deterministically
	// (`?backdrop=passthrough`); the button is for driving it by hand.
	const params = useLocalSearchParams<{ backdrop?: string }>();
	const [backdrop, setBackdrop] = useState<ComposerBackdrop>(
		params.backdrop === "passthrough" ? "passthrough" : "dim",
	);
	// Whether the composer was open when something else took first responder.
	// Restoring unconditionally pops the keyboard up over a composer the user had
	// left collapsed — and briefly shows both it and the sheet at once.
	const wasExpanded = useRef(false);
	const [isSending, setIsSending] = useState(false);
	const openAttachmentsSheet = useAttachmentsSheet();
	const attachments = usePromptInputAttachments();
	const router = useRouter();
	// The real pickers: existing `formSheet` routes with searchable lists. The
	// composer reports a press and these present, exactly like `+` and the
	// attachments sheet — it never holds the lists itself.
	const agentId = useNewSessionPreferencesStore((state) => state.agentId);
	const agentIconUri = useAgentIconUri(agentId);
	const selectedModel = agentId
		? {
				id: agentId,
				label: agentId,
				iconUri: agentIconUri ?? undefined,
			}
		: undefined;
	const headerChips = [
		{ id: "project", label: "superset main" },
		{ id: "branch", label: "Cloud" },
	];

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
				<Pressable
					onPress={() =>
						setBackdrop((mode) => (mode === "dim" ? "passthrough" : "dim"))
					}
					className="self-start rounded-xl border border-border px-4 py-2"
				>
					<Text className="text-foreground">{`backdrop: ${backdrop} — tap to toggle`}</Text>
				</Pressable>
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
				isSending={isSending}
				onSubmit={(text) => {
					setLastEvent(`submit "${text}"`);
					// Mirrors the real contract: the caller owns the in-flight state and
					// clears only once its own delivery succeeded.
					setIsSending(true);
					setTimeout(() => {
						setIsSending(false);
						composerRef.current?.clear();
					}, 1500);
				}}
				attachments={attachments.attachments.map((item) => ({
					id: item.id,
					uri: item.uri ?? "",
					kind: item.type === "image" ? ("image" as const) : ("file" as const),
				}))}
				onExpandedChange={(expanded) => {
					wasExpanded.current = expanded;
				}}
				onAttachmentsPress={() => {
					setLastEvent("attachments");
					// Presenting the sheet resigns first responder and collapses the
					// composer. Restore it only if it was open — otherwise `+` from the
					// collapsed pill would raise the keyboard behind the sheet.
					const restore = wasExpanded.current;
					openAttachmentsSheet({
						onClosed: () => {
							if (restore) composerRef.current?.focus();
						},
					});
				}}
				selectedModel={selectedModel}
				headerChips={headerChips}
				onModelPress={() => {
					setLastEvent("model picker");
					router.push("/(authenticated)/(home)/new-session/agent");
				}}
				onChipPress={(id) => {
					setLastEvent(`chip ${id}`);
					router.push(
						id === "project"
							? "/(authenticated)/(home)/new-session/project"
							: "/(authenticated)/(home)/new-session/branch",
					);
				}}
				onRemoveAttachment={(id) => attachments.remove(id)}
				onAttachmentPress={(id) => setLastEvent(`open attachment ${id}`)}
				onDictatePress={() => setLastEvent("dictate")}
			/>
		</View>
	);
}
