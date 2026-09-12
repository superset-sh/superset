import { useLingui } from "@lingui/react/macro";
import { Link } from "expo-router";
import type { ReactNode } from "react";

export function WorkspaceRowMenu({
	pinned,
	onTogglePin,
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
	pinned: boolean;
	onTogglePin: () => void;
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
								message: "Mark as Read",
							})
						: t({
								message: "Mark as Unread",
							})}
				</Link.MenuAction>
				<Link.MenuAction
					icon={pinned ? "pin.slash" : "pin"}
					onPress={onTogglePin}
				>
					{pinned ? t({ message: "Unpin" }) : t({ message: "Pin" })}
				</Link.MenuAction>
				{canRename ? (
					<Link.MenuAction icon="pencil" onPress={onRename}>
						{t({ message: "Rename" })}
					</Link.MenuAction>
				) : null}
				{canDelete ? (
					<Link.MenuAction icon="trash" destructive onPress={onDelete}>
						{t({ message: "Delete" })}
					</Link.MenuAction>
				) : null}
				<Link.Menu inline>
					<Link.MenuAction icon="doc.on.doc" onPress={onCopyId}>
						{t({ message: "Copy ID" })}
					</Link.MenuAction>
					<Link.MenuAction icon="square.and.arrow.up" onPress={onShare}>
						{t({ message: "Share" })}
					</Link.MenuAction>
				</Link.Menu>
			</Link.Menu>
		</Link>
	);
}
