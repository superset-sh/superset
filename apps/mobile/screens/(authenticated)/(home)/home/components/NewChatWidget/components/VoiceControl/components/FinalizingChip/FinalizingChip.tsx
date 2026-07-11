import { Button, ProgressView } from "@expo/ui/swift-ui";
import {
	buttonBorderShape,
	buttonStyle,
	frame,
	tint,
} from "@expo/ui/swift-ui/modifiers";
import { FOREGROUND } from "../../../../constants";

export function FinalizingChip() {
	return (
		<Button
			onPress={() => {}}
			modifiers={[
				buttonStyle("bordered"),
				buttonBorderShape("circle"),
				tint(FOREGROUND),
			]}
		>
			<ProgressView modifiers={[frame({ width: 26, height: 26 })]} />
		</Button>
	);
}
