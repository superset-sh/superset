import { Trans } from "@lingui/react/macro";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import { useState } from "react";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import { ListGroupHeader } from "renderer/routes/_authenticated/_dashboard/components/ListGroupHeader";
import {
	type CloudWorkspaceListItem,
	CloudWorkspaceListRow,
} from "./components/CloudWorkspaceListRow";

/** A group with `person` is someone's boxes, so its rows drop the creator avatar. */
export interface CloudWorkspaceGroup {
	key: string;
	label: string;
	person?: CloudWorkspaceRow["createdBy"];
	items: CloudWorkspaceListItem[];
}

type CloudWorkspacesListContent =
	| { groups: CloudWorkspaceGroup[] }
	| { items: CloudWorkspaceListItem[] };

interface CloudWorkspacesListProps {
	content: CloudWorkspacesListContent;
	now: Date;
	onOpen: (workspaceId: string) => void;
	onOpenPullRequest: (url: string) => void;
	onOpenRepo: (fullName: string) => void;
	onSetInSidebar: (workspaceId: string, inSidebar: boolean) => void;
	onUnarchive?: (workspaceId: string) => void;
}

export function CloudWorkspacesList({
	content,
	now,
	onOpen,
	onOpenPullRequest,
	onOpenRepo,
	onSetInSidebar,
	onUnarchive,
}: CloudWorkspacesListProps) {
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	const renderRow = (item: CloudWorkspaceListItem, showCreator: boolean) => (
		<CloudWorkspaceListRow
			key={item.workspace.id}
			item={item}
			now={now}
			showCreator={showCreator}
			onOpen={() => onOpen(item.workspace.id)}
			onOpenPullRequest={onOpenPullRequest}
			onOpenRepo={onOpenRepo}
			onSetInSidebar={(inSidebar) =>
				onSetInSidebar(item.workspace.id, inSidebar)
			}
			onUnarchive={onUnarchive && (() => onUnarchive(item.workspace.id))}
		/>
	);
	const isEmpty =
		"groups" in content
			? content.groups.length === 0
			: content.items.length === 0;
	if (isEmpty) {
		return (
			<div className="p-8 text-sm text-muted-foreground">
				<Trans>Nothing here.</Trans>
			</div>
		);
	}
	return (
		<table className="w-full border-separate border-spacing-0">
			{"items" in content ? (
				<tbody>{content.items.map((item) => renderRow(item, true))}</tbody>
			) : null}
			{("groups" in content ? content.groups : []).map((group) => {
				const { key, label, person, items } = group;
				const isPersonGroup = "person" in group;
				const isCollapsed = collapsed.has(key);
				return (
					<tbody key={key}>
						<ListGroupHeader
							leading={
								!isPersonGroup ? null : person ? (
									<AvatarStack
										people={[
											{
												id: person.userId,
												name: person.name,
												image: person.image,
											},
										]}
										size={20}
									/>
								) : (
									<span className="size-5 rounded-full border border-dashed border-muted-foreground" />
								)
							}
							label={label}
							count={items.length}
							colSpan={4}
							isCollapsed={isCollapsed}
							onToggle={() =>
								setCollapsed((current) => {
									const next = new Set(current);
									if (isCollapsed) next.delete(key);
									else next.add(key);
									return next;
								})
							}
						/>
						{!isCollapsed &&
							items.map((item) => renderRow(item, !isPersonGroup))}
					</tbody>
				);
			})}
		</table>
	);
}
