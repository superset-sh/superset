import { Ellipsis } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export function MoreButton({
	a11yLabel,
	onPress,
}: {
	a11yLabel: string;
	onPress: () => void;
}) {
	return (
		<Button
			accessibilityLabel={a11yLabel}
			variant="ghost"
			size="icon"
			hitSlop={8}
			onPress={onPress}
		>
			<Icon as={Ellipsis} className="text-muted-foreground size-5" />
		</Button>
	);
}
