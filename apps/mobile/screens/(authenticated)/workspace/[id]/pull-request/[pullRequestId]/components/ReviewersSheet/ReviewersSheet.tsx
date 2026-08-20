import { Stack, useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type {
	PullRequestReviewer,
	ReviewerState,
} from "../../../../utils/pullRequest";
import { ReviewerAvatar } from "../ReviewerAvatar";

const GROUPS: { state: ReviewerState; title: string }[] = [
	{ state: "CHANGES_REQUESTED", title: "Requested Changes" },
	{ state: "APPROVED", title: "Approved" },
	{ state: "REQUESTED", title: "Assigned" },
	{ state: "COMMENTED", title: "Commented" },
	{ state: "DISMISSED", title: "Dismissed" },
];

/** The whole review picture, one group per state, worst news first. */
export function ReviewersSheet({
	reviewers,
}: {
	reviewers: PullRequestReviewer[];
}) {
	const router = useRouter();
	const groups = GROUPS.map((group) => ({
		...group,
		members: reviewers.filter((reviewer) => reviewer.state === group.state),
	})).filter((group) => group.members.length > 0);

	return (
		<>
			<Stack.Screen options={{ title: "Reviewers" }} />
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityLabel="Close"
					icon="xmark"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			<ScrollView
				className="bg-background flex-1"
				contentContainerClassName="gap-6 px-4 pb-10 pt-2"
				contentInsetAdjustmentBehavior="automatic"
			>
				{groups.length === 0 ? (
					<Text className="text-muted-foreground text-[15px]">
						No reviewers assigned yet.
					</Text>
				) : null}
				{groups.map((group) => (
					<View className="gap-3" key={group.state}>
						<Text className="text-muted-foreground text-[15px]">
							{group.title}{" "}
							<Text className="text-muted-foreground/60 text-[15px]">
								{group.members.length}
							</Text>
						</Text>
						{group.members.map((reviewer) => (
							<View
								className="flex-row items-center gap-3"
								key={`${group.state}-${reviewer.login}`}
							>
								<View>
									<ReviewerAvatar reviewer={reviewer} size={40} />
									{reviewer.state === "APPROVED" ? (
										<View className="border-background absolute -bottom-0.5 -right-0.5 size-[18px] items-center justify-center rounded-full border-2 bg-green-500">
											<Icon
												as={Check}
												className="text-background size-3"
												strokeWidth={3.5}
											/>
										</View>
									) : null}
								</View>
								<Text className="flex-1 text-[17px]" numberOfLines={1}>
									{reviewer.login}
								</Text>
							</View>
						))}
					</View>
				))}
			</ScrollView>
		</>
	);
}
