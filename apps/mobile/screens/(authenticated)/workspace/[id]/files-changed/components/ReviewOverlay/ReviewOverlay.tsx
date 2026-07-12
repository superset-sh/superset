import { Stack } from "expo-router";

// Native bottom toolbar bar buttons: UIKit owns sizing/placement, matching
// the header buttons' glass. A custom Toolbar.View capsule (for a GitHub-style
// disclosure chevron) gets squeezed in bottom placements — no sizing contract
// — so the CTA stays a system prominent button.
export function ReviewOverlay({
	draftCount,
	onFinishReview,
	onJumpToFile,
}: {
	draftCount: number;
	onFinishReview: () => void;
	onJumpToFile: () => void;
}) {
	return (
		<Stack.Toolbar placement="bottom">
			<Stack.Toolbar.Spacer />
			<Stack.Toolbar.Button
				hidden={draftCount === 0}
				variant="prominent"
				tintColor="#16a34a"
				onPress={onFinishReview}
			>
				{draftCount > 1 ? `Send to chat (${draftCount})` : "Send to chat"}
			</Stack.Toolbar.Button>
			<Stack.Toolbar.Button
				icon="arrow.down.doc"
				accessibilityLabel="Jump to file"
				onPress={onJumpToFile}
			/>
		</Stack.Toolbar>
	);
}
