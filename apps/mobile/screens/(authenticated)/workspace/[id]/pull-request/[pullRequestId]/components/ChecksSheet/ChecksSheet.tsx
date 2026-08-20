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
 * Every check, filterable. The filter is the sheet's title rather than a row in
 * the list, so it stays put while the checks scroll under it.
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
	const router = useRouter();
	const [filter, setFilter] = useState<ChecksFilterValue>("all");
	const { counts, options, groups } = checksFilterState(checks, filter);

	return (
		<>
			<Stack.Screen
				options={{
					headerTitle: () => (
						<ChecksFilter
							onChange={setFilter}
							options={options}
							value={filter}
						/>
					),
				}}
			/>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityLabel="Close"
					icon="xmark"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			{counts.failed > 0 && onFixAll ? (
				<Stack.Toolbar placement="right">
					<Stack.Toolbar.Button
						accessibilityLabel="Fix all failing checks"
						icon="wrench.and.screwdriver"
						onPress={onFixAll}
					/>
				</Stack.Toolbar>
			) : null}
			<ScrollView
				className="bg-background flex-1"
				contentContainerClassName="gap-6 px-4 pb-10 pt-2"
				contentInsetAdjustmentBehavior="automatic"
			>
				{groups.map((group) => (
					<View className="gap-3" key={group.filter}>
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
