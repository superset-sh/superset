import { Trans } from "@lingui/react/macro";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { FileText } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
	NO_PAGES,
	type OrgPage,
	useWorkspacePagesQuery,
} from "@/screens/(authenticated)/pages/hooks/usePages";

function PageCard({ page }: { page: OrgPage }) {
	const router = useRouter();

	return (
		<Pressable
			accessibilityLabel={page.title ?? page.slug}
			accessibilityRole="button"
			className="w-[48%] active:opacity-60"
			// replace, not push: this is a form sheet, and a page pushed inside it
			// opens as a sliver of a sheet instead of taking the screen.
			onPress={() =>
				router.replace({
					pathname: "/(authenticated)/pages/[slug]",
					params: { slug: page.slug },
				})
			}
		>
			<View className="bg-secondary aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl">
				{page.thumbnailUrl ? (
					<Image
						source={{ uri: page.thumbnailUrl }}
						style={{ height: "100%", width: "100%" }}
						contentFit="cover"
						contentPosition="top center"
						transition={120}
					/>
				) : (
					<Icon as={FileText} className="text-muted-foreground size-6" />
				)}
			</View>
			<Text className="mt-2 text-[13px] font-medium" numberOfLines={1}>
				{page.title ?? page.slug}
			</Text>
		</Pressable>
	);
}

/** The pages this workspace published, as Cursor's grid of cards. */
export function WorkspacePages({
	workspaceId,
}: {
	workspaceId: string | null;
}) {
	const pages = useWorkspacePagesQuery(workspaceId);
	const items = pages.data ?? NO_PAGES;

	if (items.length === 0) return null;

	return (
		<View>
			<Text className="text-muted-foreground mt-9 pb-3 text-[15px]">
				<Trans>Pages</Trans>
			</Text>
			<View className="flex-row flex-wrap justify-between gap-y-4">
				{items.map((page) => (
					<PageCard key={page.id} page={page} />
				))}
			</View>
		</View>
	);
}
