import { Link } from "expo-router";
import type { ReactNode } from "react";

export function WorkspaceRowMenu({
	canRename,
	canDelete,
	onRename,
	onDelete,
	onCopyId,
	onShare,
	children,
}: {
	canRename: boolean;
	canDelete: boolean;
	onRename: () => void;
	onDelete: () => void;
	onCopyId: () => void;
	onShare: () => void;
	children: ReactNode;
}) {
	// Tap navigation lives on the row itself; the Link exists solely because
	// Link.Menu must be a direct child of Link, so tap is a no-op here.
	return (
		<Link
			href="/(authenticated)/(home)"
			onPress={(event) => event.preventDefault()}
			asChild
		>
			<Link.Trigger>{children}</Link.Trigger>
			<Link.Menu>
				{/* Each action is its own direct child: Link.Menu drops anything
				    wrapped in a Fragment. */}
				{canRename ? (
					<Link.MenuAction icon="pencil" onPress={onRename}>
						Rename
					</Link.MenuAction>
				) : null}
				{canDelete ? (
					<Link.MenuAction icon="trash" destructive onPress={onDelete}>
						Delete
					</Link.MenuAction>
				) : null}
				<Link.Menu inline>
					<Link.MenuAction icon="doc.on.doc" onPress={onCopyId}>
						Copy ID
					</Link.MenuAction>
					<Link.MenuAction icon="square.and.arrow.up" onPress={onShare}>
						Share
					</Link.MenuAction>
				</Link.Menu>
			</Link.Menu>
		</Link>
	);
}
