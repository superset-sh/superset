import { useLingui } from "@lingui/react/macro";
import { useRouter } from "expo-router";
import { Users } from "lucide-react-native";
import { useMemo } from "react";
import { ScrollView } from "react-native";
import { Icon } from "@/components/ui/icon";
import { useArchivedCloudWorkspaces } from "@/hooks/useArchivedCloudWorkspaces";
import { useCloudWorkspaces } from "@/hooks/useCloudWorkspaces";
import { useSession } from "@/lib/auth/client";
import { posthog } from "@/lib/posthog";
import {
	type CloudCreatorFilter,
	useWorkspacesFilterStore,
} from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowCheck } from "@/screens/(authenticated)/components/ListRowCheck";
import { UserAvatar } from "@/screens/(authenticated)/settings/components/UserAvatar";

export function CreatorFilterScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const { data: session } = useSession();
	const myId = session?.user?.id ?? null;
	const creator = useWorkspacesFilterStore((store) => store.cloudCreator);
	const setCloudCreator = useWorkspacesFilterStore(
		(store) => store.setCloudCreator,
	);
	const { workspaces: active } = useCloudWorkspaces();
	const { workspaces: archived } = useArchivedCloudWorkspaces();

	const people = useMemo(() => {
		const byId = new Map<
			string,
			{ userId: string; name: string; image: string | null; count: number }
		>();
		for (const row of [...active, ...archived]) {
			const person = row.createdBy;
			if (!person?.userId || person.userId === myId) continue;
			const existing = byId.get(person.userId);
			if (existing) existing.count += 1;
			else
				byId.set(person.userId, {
					userId: person.userId,
					name: person.name ?? "",
					image: person.image ?? null,
					count: 1,
				});
		}
		return [...byId.values()].sort((a, b) => b.count - a.count);
	}, [active, archived, myId]);

	const pick = (value: CloudCreatorFilter) => {
		setCloudCreator(value);
		posthog.capture("filter_applied", {
			filter: "cloud_creator",
			value: typeof value === "string" ? value : "person",
		});
		router.back();
	};

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6"
			contentInsetAdjustmentBehavior="automatic"
		>
			<ListRow
				icon={
					<UserAvatar
						name={session?.user?.name ?? ""}
						image={session?.user?.image}
						className="size-6"
						textClassName="text-[9px]"
					/>
				}
				label={t({ message: "Created by me" })}
				trailing={<ListRowCheck visible={creator === "me"} />}
				onPress={() => pick("me")}
			/>
			<ListRow
				icon={
					<Icon
						as={Users}
						className="text-muted-foreground size-5"
						strokeWidth={1.75}
					/>
				}
				label={t({ message: "Anyone" })}
				trailing={<ListRowCheck visible={creator === "anyone"} />}
				onPress={() => pick("anyone")}
				isLast={people.length === 0}
			/>
			{people.map((person, index) => (
				<ListRow
					key={person.userId}
					icon={
						<UserAvatar
							name={person.name}
							image={person.image}
							className="size-6"
							textClassName="text-[9px]"
						/>
					}
					label={person.name}
					trailing={
						<ListRowCheck
							visible={
								typeof creator === "object" && creator.userId === person.userId
							}
						/>
					}
					onPress={() =>
						pick({
							userId: person.userId,
							name: person.name,
							image: person.image,
						})
					}
					isLast={index === people.length - 1}
				/>
			))}
		</ScrollView>
	);
}
