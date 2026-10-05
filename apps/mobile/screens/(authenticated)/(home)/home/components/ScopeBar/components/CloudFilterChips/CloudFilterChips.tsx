import { useLingui } from "@lingui/react/macro";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSession } from "@/lib/auth/client";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { UserAvatar } from "@/screens/(authenticated)/settings/components/UserAvatar";
import { Chip } from "../Chip";

export function CloudFilterChips() {
	const { t } = useLingui();
	const router = useRouter();
	const { data: session } = useSession();
	const status = useWorkspacesFilterStore((store) => store.cloudStatus);
	const creator = useWorkspacesFilterStore((store) => store.cloudCreator);

	const person =
		creator === "me"
			? {
					label: t({ message: "Mine", context: "workspaces I created" }),
					name: session?.user?.name ?? "",
					image: session?.user?.image ?? null,
				}
			: creator === "anyone"
				? null
				: {
						label: creator.name.split(" ")[0],
						name: creator.name,
						image: creator.image,
					};

	const open = (path: "status" | "creator") => {
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		router.push(`/(authenticated)/(home)/filter/${path}`);
	};

	return (
		<>
			<Chip
				label={
					status === "archived"
						? t({ message: "Archived" })
						: t({ message: "Active", context: "cloud workspace status" })
				}
				onPress={() => open("status")}
			/>
			<Chip
				label={person?.label ?? t({ message: "Anyone" })}
				leading={
					person ? (
						<UserAvatar
							name={person.name}
							image={person.image}
							className="size-4"
							textClassName="text-[7px]"
						/>
					) : undefined
				}
				onPress={() => open("creator")}
			/>
		</>
	);
}
