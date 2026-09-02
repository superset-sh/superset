import { useLingui } from "@lingui/react/macro";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { PullRequestCheck } from "../../../../utils/pullRequest";
import { CheckRow } from "../CheckRow";
import { ChecksFilter } from "./components/ChecksFilter";
import {
	type ChecksFilterValue,
	checksFilterState,
} from "./utils/checksFilter";

/**
 * Every check, filterable. The filter cannot share the header title slot
 * with the ✕ and Fix All — there is not enough width for four segments.
 */
export function ChecksSheet({
	checks,
	onOpenCheck,
	onFixAll,
}: {
	checks: PullRequestCheck[];
	onOpenCheck?: (check: PullRequestCheck) => void;
	onFixAll?: () => void;
}) {
	const { t } = useLingui();
	const router = useRouter();
	const [filter, setFilter] = useState<ChecksFilterValue>("all");
	const {
		counts,
		options,
		groups,
		filter: active,
	} = checksFilterState(checks, filter);

	return (
		<>
			<Stack.Screen
				options={{
					headerTitle: t({ message: "Checks" }),
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
			{counts.failed > 0 && onFixAll ? (
				<Stack.Toolbar placement="right">
					<Stack.Toolbar.Button
						accessibilityLabel={t({
							message: "Fix all failing checks",
						})}
						icon="wrench.and.screwdriver"
						onPress={onFixAll}
					/>
				</Stack.Toolbar>
			) : null}
			<ScrollView
				className="bg-background flex-1"
				contentContainerClassName="gap-6 pb-10 pt-2"
				contentInsetAdjustmentBehavior="automatic"
			>
				<ChecksFilter onChange={setFilter} options={options} value={active} />
				{groups.map((group) => (
					<View className="gap-3 px-4" key={group.filter}>
						<Text className="text-muted-foreground text-[15px]">
							{group.title}{" "}
							<Text className="text-muted-foreground/60 text-[15px]">
								{group.members.length}
							</Text>
						</Text>
						{group.members.map((check) => (
							<CheckRow
								check={check}
								key={check.name}
								onPress={onOpenCheck ? () => onOpenCheck(check) : undefined}
							/>
						))}
					</View>
				))}
			</ScrollView>
		</>
	);
}
