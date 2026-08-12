import { ScrollView, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowValue } from "@/screens/(authenticated)/components/ListRowValue";
import { useActivePlan } from "../hooks/useActivePlan";

export function BillingSettingsScreen() {
	const theme = useTheme();
	const activePlan = useActivePlan();
	const isPaid = activePlan != null && activePlan.plan !== "free";

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6 pb-12"
		>
			{isPaid ? (
				<>
					<ListRow
						label="Plan"
						trailing={
							<ListRowValue
								value={
									activePlan.plan[0].toUpperCase() + activePlan.plan.slice(1)
								}
								chevron={false}
							/>
						}
					/>
					{activePlan.status ? (
						<ListRow
							label="Status"
							trailing={
								<ListRowValue value={activePlan.status} chevron={false} />
							}
						/>
					) : null}
					{activePlan.periodEnd ? (
						<ListRow
							label={activePlan.cancelAt ? "Cancels" : "Renews"}
							trailing={
								<ListRowValue
									value={activePlan.periodEnd.toLocaleDateString()}
									chevron={false}
								/>
							}
							isLast
						/>
					) : null}
				</>
			) : (
				<View className="items-center py-12">
					<Text
						className="text-base font-medium"
						style={{ color: theme.foreground }}
					>
						Free plan
					</Text>
				</View>
			)}
			<Text className="mt-6 text-sm" style={{ color: theme.mutedForeground }}>
				Manage billing from the desktop app.
			</Text>
		</ScrollView>
	);
}
