import { Trans } from "@lingui/react/macro";
import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@superset/ui/context-menu";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import type { ReactNode } from "react";
import {
	LuClock,
	LuLink,
	LuPause,
	LuPencil,
	LuPlay,
	LuTrash2,
} from "react-icons/lu";

interface AutomationActionsMenuItemsProps {
	kind: "context" | "dropdown";
	canEdit: boolean;
	enabled: boolean;
	onEdit: () => void;
	onCopyLink: () => void;
	onRunNow: () => void;
	onToggleEnabled: () => void;
	onHistory: () => void;
	onDelete: () => void;
}

export function AutomationActionsMenuItems({
	kind,
	canEdit,
	enabled,
	onEdit,
	onCopyLink,
	onRunNow,
	onToggleEnabled,
	onHistory,
	onDelete,
}: AutomationActionsMenuItemsProps) {
	const renderItem = ({
		children,
		destructive = false,
		onSelect,
	}: {
		children: ReactNode;
		destructive?: boolean;
		onSelect: () => void;
	}) => {
		const Item = kind === "context" ? ContextMenuItem : DropdownMenuItem;
		return (
			<Item
				onSelect={onSelect}
				variant={destructive ? "destructive" : "default"}
			>
				{children}
			</Item>
		);
	};

	return (
		<>
			{renderItem({
				onSelect: onEdit,
				children: (
					<>
						<LuPencil className="size-4" />
						{canEdit ? <Trans>Edit</Trans> : <Trans>View</Trans>}
					</>
				),
			})}
			{renderItem({
				onSelect: onCopyLink,
				children: (
					<>
						<LuLink className="size-4" />
						<Trans>Copy link</Trans>
					</>
				),
			})}
			{canEdit && (
				<>
					{renderItem({
						onSelect: onRunNow,
						children: (
							<>
								<LuPlay className="size-4" />
								<Trans>Run now</Trans>
							</>
						),
					})}
					{renderItem({
						onSelect: onToggleEnabled,
						children: enabled ? (
							<>
								<LuPause className="size-4" />
								<Trans>Pause</Trans>
							</>
						) : (
							<>
								<LuPlay className="size-4" />
								<Trans>Resume</Trans>
							</>
						),
					})}
					{renderItem({
						onSelect: onHistory,
						children: (
							<>
								<LuClock className="size-4" />
								<Trans>Prompt history</Trans>
							</>
						),
					})}
					{kind === "context" ? (
						<ContextMenuSeparator />
					) : (
						<DropdownMenuSeparator />
					)}
					{renderItem({
						destructive: true,
						onSelect: onDelete,
						children: (
							<>
								<LuTrash2 className="size-4" />
								<Trans>Delete</Trans>
							</>
						),
					})}
				</>
			)}
		</>
	);
}
