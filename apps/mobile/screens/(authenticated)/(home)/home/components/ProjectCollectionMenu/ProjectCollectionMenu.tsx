import { useLingui } from "@lingui/react/macro";
import type { ProjectCollectionSummary } from "@superset/shared/project-collections";
import { Link } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";

/** Long press on a project header files the project into a collection. */
export function ProjectCollectionMenu({
	collections,
	currentTag,
	onMove,
	onNewCollection,
	children,
}: {
	collections: ProjectCollectionSummary[];
	currentTag: string | null;
	onMove: (tag: string | null) => void;
	onNewCollection: () => void;
	children: ReactNode;
}) {
	const { t } = useLingui();
	// Link.Menu must be a direct child of Link; tap stays with the header.
	return (
		<Link
			href="/(authenticated)/(home)"
			onPress={(event) => event.preventDefault()}
			asChild
		>
			<Link.Trigger>
				<View collapsable={false}>{children}</View>
			</Link.Trigger>
			<Link.Menu title={t({ message: "Move to collection" })}>
				{collections.map((collection) => (
					<Link.MenuAction
						key={collection.tag}
						isOn={collection.tag === currentTag}
						onPress={() => {
							if (collection.tag !== currentTag) onMove(collection.tag);
						}}
					>
						{collection.name}
					</Link.MenuAction>
				))}
				<Link.MenuAction icon="folder.badge.plus" onPress={onNewCollection}>
					{t({ message: "New collection…" })}
				</Link.MenuAction>
				{currentTag ? (
					<Link.MenuAction
						icon="folder.badge.minus"
						onPress={() => onMove(null)}
					>
						{t({ message: "Remove from collection" })}
					</Link.MenuAction>
				) : null}
			</Link.Menu>
		</Link>
	);
}
