import { Trans, useLingui } from "@lingui/react/macro";
import { Check } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type {
	ChecksTally,
	PullRequestCheck,
} from "../../../../../../utils/pullRequest";
import { CheckRow } from "../../../CheckRow";
import { CardRow } from "../CardRow";
import { ChecksRing } from "../ChecksRing";
import { checksRowMode } from "./utils/checksRowMode";

/**
 * Three voices, one per situation the designs show. Any failure lists what is
 * wrong and hides what is fine — even while other checks still run — with a way
 * through to the rest; the ring is for in-flight-and-so-far-fine; when
 * everything passes it is a single line.
 */
export function ChecksSection({
	tally,
	onOpenChecks,
	onOpenCheck,
}: {
	tally: ChecksTally;
	onOpenChecks?: () => void;
	onOpenCheck?: (check: PullRequestCheck) => void;
}) {
	const { t } = useLingui();
	if (tally.total === 0) return null;
	const mode = checksRowMode(tally);

	if (mode === "failures") {
		return (
			<View className="gap-3">
				{tally.failing.map((check) => (
					<CheckRow
						check={check}
						key={check.name}
						onPress={onOpenCheck ? () => onOpenCheck(check) : undefined}
					/>
				))}
				{tally.total > tally.failing.length && onOpenChecks ? (
					<Pressable
						accessibilityRole="button"
						className="active:opacity-60"
						onPress={onOpenChecks}
					>
						<Text className="text-muted-foreground text-[15px]">
							<Trans>View All</Trans>
						</Text>
					</Pressable>
				) : null}
			</View>
		);
	}

	if (mode === "ring") {
		return (
			<CardRow
				label={t({
					message: `${tally.passed}/${tally.total} Checks Passing`,
				})}
				leading={<ChecksRing tally={tally} />}
				onPress={onOpenChecks}
				subLabel={t({
					message: `${tally.running} Running`,
				})}
			/>
		);
	}

	return (
		<CardRow
			label={
				tally.passed > 0
					? t({ message: "All Checks Passed" })
					: t({ message: "Checks Skipped" })
			}
			leading={
				<View className="size-[26px] items-center justify-center rounded-full bg-green-500">
					<Icon
						as={Check}
						className="text-background size-3.5"
						strokeWidth={3.5}
					/>
				</View>
			}
			onPress={onOpenChecks}
		/>
	);
}
