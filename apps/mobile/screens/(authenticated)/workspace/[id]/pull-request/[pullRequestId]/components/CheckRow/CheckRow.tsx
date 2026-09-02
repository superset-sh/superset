import { useLingui } from "@lingui/react/macro";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
	effectiveCheckStatus,
	type PullRequestCheck,
} from "../../../../utils/pullRequest";
import { checkDuration } from "../../utils/checkDuration";
import { CHECK_OUTCOME, CHECK_STYLE } from "../../utils/checkOutcome";
import { CheckStatusIcon } from "./components/CheckStatusIcon";

/** Status tile, workflow-qualified name, and how long it took. */
export function CheckRow({
	check,
	onPress,
}: {
	check: PullRequestCheck;
	onPress?: () => void;
}) {
	const { t } = useLingui();
	const outcome = CHECK_OUTCOME[effectiveCheckStatus(check)];
	const style = CHECK_STYLE[outcome];
	const took = checkDuration(check);
	return (
		<Pressable
			accessibilityLabel={t({
				message: `${check.name}, ${outcome}${took ? `, ${took}` : ""}`,
			})}
			accessibilityRole={onPress ? "button" : undefined}
			className="flex-row items-center gap-2.5 active:opacity-60"
			disabled={onPress === undefined}
			onPress={onPress}
		>
			<View
				className={cn(
					// Smaller than an avatar: a check's tile carries a 14pt glyph with
					// 4pt around it.
					"size-[22px] items-center justify-center rounded-lg",
					style.surface,
				)}
			>
				<CheckStatusIcon outcome={outcome} />
			</View>
			<Text className="flex-1 text-[15px]" numberOfLines={1}>
				{check.name}
			</Text>
			{took ? (
				<Text className="text-muted-foreground text-[15px]">{took}</Text>
			) : null}
		</Pressable>
	);
}
