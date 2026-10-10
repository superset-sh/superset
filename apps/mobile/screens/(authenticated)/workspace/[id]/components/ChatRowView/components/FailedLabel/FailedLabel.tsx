import { Trans } from "@lingui/react/macro";
import { Text } from "@/components/ui/text";

export function FailedLabel() {
	return (
		<Text className="ml-1.5 text-xs text-destructive">
			<Trans>Failed</Trans>
		</Text>
	);
}
