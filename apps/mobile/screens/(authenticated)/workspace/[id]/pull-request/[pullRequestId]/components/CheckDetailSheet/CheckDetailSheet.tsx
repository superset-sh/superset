import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { formatDateTime } from "@superset/i18n/format";
import { Stack, useRouter } from "expo-router";
import { ArrowUpRight } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
	effectiveCheckStatus,
	type PullRequestCheck,
} from "../../../../utils/pullRequest";
import { checkDuration } from "../../utils/checkDuration";
import { Row } from "./components/Row";

const STATUS_LABEL: Record<
	string,
	{ label: MessageDescriptor; className: string }
> = {
	passed: {
		label: msg({ message: "Passed" }),
		className: "bg-green-500/15 text-green-500",
	},
	failed: {
		label: msg({ message: "Failed" }),
		className: "bg-red-500/15 text-red-500",
	},
	"needs-action": {
		label: msg({
			message: "Needs Action",
		}),
		className: "bg-amber-500/15 text-amber-500",
	},
	running: {
		label: msg({ message: "Running" }),
		className: "bg-amber-500/15 text-amber-500",
	},
	ignored: {
		label: msg({ message: "Skipped" }),
		className: "bg-secondary text-muted-foreground",
	},
};

/**
 * One check, close up. Leaving for GitHub is the last option rather than the
 * only one — the agent can be pointed at the failure from here.
 */
export function CheckDetailSheet({
	check,
	onFixWithAgent,
	onOpenInGitHub,
}: {
	check: PullRequestCheck;
	onFixWithAgent?: () => void;
	onOpenInGitHub?: () => void;
}) {
	const { i18n, t } = useLingui();
	const status = STATUS_LABEL[effectiveCheckStatus(check)];
	const router = useRouter();
	const took = checkDuration(check);
	const stamp = (date: Date | null) =>
		date
			? formatDateTime(date, { dateStyle: "medium", timeStyle: "short" })
			: "—";

	return (
		<>
			<Stack.Screen
				options={{
					title: t({ message: "Details" }),
				}}
			/>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityLabel={t({
						message: "Close",
					})}
					icon="xmark"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			<ScrollView
				className="bg-background flex-1"
				contentContainerClassName="px-4 pb-10 pt-2"
				contentInsetAdjustmentBehavior="automatic"
			>
				<Text className="pb-2 font-semibold text-[17px]">{check.name}</Text>

				<View className="border-border/60 flex-row items-center justify-between border-b py-4">
					<Text className="text-[17px]">
						<Trans>Status</Trans>
					</Text>
					<Text
						className={cn(
							"overflow-hidden rounded-full px-3 py-1 font-medium text-[15px]",
							status?.className,
						)}
					>
						{status ? i18n._(status.label) : ""}
					</Text>
				</View>
				<Row label={t({ message: "Started" })} value={stamp(check.startedAt)} />
				<Row
					label={t({ message: "Completed" })}
					value={stamp(check.completedAt)}
				/>
				{took ? <Row label={t({ message: "Duration" })} value={took} /> : null}

				<View className="gap-2 pt-8">
					{onFixWithAgent ? (
						<Pressable
							accessibilityRole="button"
							className="h-[46px] items-center justify-center rounded-md bg-neutral-100 active:opacity-80"
							onPress={onFixWithAgent}
						>
							<Text className="font-medium text-[15px] text-neutral-900">
								<Trans>Fix Check with Agent</Trans>
							</Text>
						</Pressable>
					) : null}
					{onOpenInGitHub ? (
						<Pressable
							accessibilityRole="button"
							className="bg-secondary h-[46px] flex-row items-center justify-center gap-1.5 rounded-md active:opacity-80"
							onPress={onOpenInGitHub}
						>
							<Text className="text-secondary-foreground font-medium text-[15px]">
								<Trans>View in GitHub</Trans>
							</Text>
							<Icon
								as={ArrowUpRight}
								className="text-secondary-foreground size-4"
							/>
						</Pressable>
					) : null}
				</View>
			</ScrollView>
		</>
	);
}
