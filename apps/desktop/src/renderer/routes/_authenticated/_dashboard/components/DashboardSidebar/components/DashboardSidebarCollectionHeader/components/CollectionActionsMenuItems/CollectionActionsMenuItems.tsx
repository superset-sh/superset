import { Trans, useLingui } from "@lingui/react/macro";
import {
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import {
	LuImage,
	LuPalette,
	LuPencil,
	LuSmile,
	LuTrash2,
	LuX,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { DashboardSidebarCollection } from "../../../../types";
import {
	COLLECTION_ICON_EMOJI,
	shrinkIconDataUrl,
} from "../../../../utils/collectionIcon";
import { ColorMenuItems } from "../../../ColorMenuItems";

export type CollectionActionsMenuKind = "context" | "dropdown";

interface CollectionActionsMenuItemsProps {
	collection: DashboardSidebarCollection;
	kind: CollectionActionsMenuKind;
	onRename: () => void;
	onSetColor: (color: string | null) => void;
	onSetIcon: (icon: string | null) => void;
	onDelete: () => void;
}

/**
 * The collection actions shared by the right-click ContextMenu and the hover "..."
 * DropdownMenu — the collection counterpart of SectionActionsMenuItems one level
 * down.
 */
export function CollectionActionsMenuItems({
	collection,
	kind,
	onRename,
	onSetColor,
	onSetIcon,
	onDelete,
}: CollectionActionsMenuItemsProps) {
	const Item = kind === "context" ? ContextMenuItem : DropdownMenuItem;
	const Separator =
		kind === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
	const Sub = kind === "context" ? ContextMenuSub : DropdownMenuSub;
	const SubTrigger =
		kind === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
	const SubContent =
		kind === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
	const iconClassName = kind === "context" ? "size-4 mr-2" : "size-4";

	const { t } = useLingui();
	const selectImageFile = electronTrpc.window.selectImageFile.useMutation();

	// A picked file is re-encoded small before it goes in the store: collection
	// rows share the sidebar's local quota with everything else in it.
	const chooseImageIcon = async () => {
		try {
			const result = await selectImageFile.mutateAsync();
			if (result.canceled || !result.dataUrl) return;
			onSetIcon(await shrinkIconDataUrl(result.dataUrl));
		} catch (error) {
			toast.error(
				t({
					id: "dashboard.sidebar.collectionMenu.iconImageFailed",
					message: "Couldn't use that image",
				}),
				{
					description: error instanceof Error ? error.message : String(error),
				},
			);
		}
	};

	return (
		<>
			<Item onSelect={onRename}>
				<LuPencil className={iconClassName} />
				<Trans id="dashboard.sidebar.collectionMenu.rename">
					Rename collection
				</Trans>
			</Item>
			<Sub>
				<SubTrigger>
					<LuPalette className={iconClassName} />
					<Trans id="dashboard.sidebar.collectionMenu.setColor">
						Set collection color
					</Trans>
				</SubTrigger>
				<SubContent className="max-h-80 w-40 overflow-y-auto">
					<ColorMenuItems
						kind={kind}
						color={collection.color}
						onSelect={onSetColor}
					/>
				</SubContent>
			</Sub>
			<Sub>
				<SubTrigger>
					<LuSmile className={iconClassName} />
					<Trans id="dashboard.sidebar.collectionMenu.setIcon">
						Set collection icon
					</Trans>
				</SubTrigger>
				<SubContent className="w-56">
					{/* Menu items, not plain buttons, so the grid stays on the menu's
					 * roving focus and arrow keys reach every emoji. */}
					<div className="grid grid-cols-8 gap-0.5 p-1">
						{COLLECTION_ICON_EMOJI.map((emoji) => (
							<Item
								key={emoji}
								aria-label={t({
									id: "dashboard.sidebar.collectionMenu.useEmojiIcon",
									message: `Use ${emoji} as the collection icon`,
								})}
								onSelect={() => onSetIcon(emoji)}
								className={cn(
									"size-6 justify-center p-0 text-base",
									collection.icon === emoji && "bg-fill-selected",
								)}
							>
								{emoji}
							</Item>
						))}
					</div>
					<Separator />
					<Item onSelect={() => void chooseImageIcon()}>
						<LuImage className={iconClassName} />
						<Trans id="dashboard.sidebar.collectionMenu.chooseImage">
							Choose image…
						</Trans>
					</Item>
					{collection.icon && (
						<Item onSelect={() => onSetIcon(null)}>
							<LuX className={iconClassName} />
							<Trans id="dashboard.sidebar.collectionMenu.removeIcon">
								Remove icon
							</Trans>
						</Item>
					)}
				</SubContent>
			</Sub>
			<Separator />
			<Item variant="destructive" onSelect={onDelete}>
				<LuTrash2 className={iconClassName} />
				<Trans id="dashboard.sidebar.collectionMenu.delete">
					Delete collection
				</Trans>
			</Item>
		</>
	);
}
