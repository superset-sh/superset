import { useLingui } from "@lingui/react/macro";
import { Link } from "expo-router";
import type { ReactNode } from "react";

export function WorkspaceRowMenu({
	canRename,
	canDelete,
	isUnread,
	onToggleUnread,
	onRename,
	onDelete,
	onCopyId,
	onShare,
	children,
}: {
	canRename: boolean;
	canDelete: boolean;
	isUnread: boolean;
	onToggleUnread: () => void;
	onRename: () => void;
	onDelete: () => void;
	onCopyId: () => void;
	onShare: () => void;
	children: ReactNode;
}) {
	const { t } = useLingui();
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
				<Link.MenuAction
					icon={isUnread ? "envelope.open" : "envelope.badge"}
					onPress={onToggleUnread}
				>
					{isUnread
						? t({
								id: "mobile.workspaceRow.markAsRead",
								message: "Mark as Read",
							})
						: t({
								id: "mobile.workspaceRow.markAsUnread",
								message: "Mark as Unread",
							})}
				</Link.MenuAction>
				{canRename ? (
					<Link.MenuAction icon="pencil" onPress={onRename}>
						{t({ id: "mobile.workspaceRow.rename", message: "Rename" })}
					</Link.MenuAction>
				) : null}
				{canDelete ? (
					<Link.MenuAction icon="trash" destructive onPress={onDelete}>
						{t({ id: "mobile.workspaceRow.delete", message: "Delete" })}
					</Link.MenuAction>
				) : null}
				<Link.Menu inline>
					<Link.MenuAction icon="doc.on.doc" onPress={onCopyId}>
						{t({ id: "mobile.workspaceRow.copyId", message: "Copy ID" })}
					</Link.MenuAction>
					<Link.MenuAction icon="square.and.arrow.up" onPress={onShare}>
						{t({ id: "mobile.common.share", message: "Share" })}
					</Link.MenuAction>
				</Link.Menu>
			</Link.Menu>
		</Link>
	);
}
