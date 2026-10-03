import { useLingui } from "@lingui/react/macro";
import { memo } from "react";
import { View } from "react-native";
import type { DiffSide } from "../../../hooks/useDiffSideImage";
import type { ChangesetSource } from "../../../hooks/useWorkspaceChangeset";
import type { ListItem } from "../../utils/buildListItems";
import { ImageSidePanel } from "./components/ImageSidePanel";

export const ImageDiffRow = memo(function ImageDiffRow({
	item,
	hostUrl,
	workspaceId,
	worktreePath,
	onOpenSide,
}: {
	item: Extract<ListItem, { kind: "image" }>;
	hostUrl: string | null;
	workspaceId: string | null;
	worktreePath: string | null;
	onOpenSide: (path: string, source: ChangesetSource, side: DiffSide) => void;
}) {
	const { t } = useLingui();
	const captions: Record<DiffSide, string> = {
		old: t({ message: "Before" }),
		new: t({ message: "After" }),
	};
	return (
		<View className="gap-2 px-4 py-3">
			{item.sides.map((side) => {
				const path = side === "old" ? item.oldPath : item.path;
				return (
					<ImageSidePanel
						key={`${side}:${path}`}
						hostUrl={hostUrl}
						workspaceId={workspaceId}
						worktreePath={worktreePath}
						category={item.source}
						path={path}
						side={side}
						caption={item.sides.length === 2 ? captions[side] : null}
						onPress={() => onOpenSide(path, item.source, side)}
					/>
				);
			})}
		</View>
	);
});
