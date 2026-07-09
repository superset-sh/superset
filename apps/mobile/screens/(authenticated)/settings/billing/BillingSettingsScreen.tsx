import { useLiveQuery } from "@tanstack/react-db";
import { ScrollView, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowValue } from "@/screens/(authenticated)/components/ListRowValue";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { activeSubscription } from "../utils/activeSubscription";

export function BillingSettingsScreen() {
	const theme = useTheme();
	const collections = useCollections();

	const { data: subscriptions } = useLiveQuery(
		(q) => q.from({ subscriptions: collections.subscriptions }),
		[collections],
	);

	const subscription = activeSubscription(subscriptions ?? []);

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6 pb-12"
		>
			{subscription ? (
				<>
					<ListRow
						label="Plan"
						trailing={
							<ListRowValue
								value={
									subscription.plan[0].toUpperCase() +
									subscription.plan.slice(1)
								}
								chevron={false}
							/>
						}
					/>
					<ListRow
						label="Status"
						trailing={
							<ListRowValue value={subscription.status} chevron={false} />
						}
					/>
					{subscription.seats != null ? (
						<ListRow
							label="Seats"
							trailing={
								<ListRowValue
									value={String(subscription.seats)}
									chevron={false}
								/>
							}
						/>
					) : null}
					{subscription.periodEnd ? (
						<ListRow
							label={subscription.cancelAtPeriodEnd ? "Cancels" : "Renews"}
							trailing={
								<ListRowValue
									value={subscription.periodEnd.toLocaleDateString()}
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
