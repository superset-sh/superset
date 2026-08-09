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
import { useMemo } from "react";
import { HiCheck } from "react-icons/hi2";
import {
	LuArrowRightLeft,
	LuArrowUp,
	LuPalette,
	LuPencil,
	LuTrash2,
} from "react-icons/lu";
import {
	canMoveSectionToParent,
	useDashboardSidebarState,
} from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	PROJECT_COLOR_DEFAULT,
	PROJECT_COLORS,
} from "shared/constants/project-colors";
import type {
	DashboardSidebarSectionActionsProps,
	SectionActionsMenuKind,
} from "../../types";

interface SectionActionsMenuItemsProps
	extends DashboardSidebarSectionActionsProps {
	kind: SectionActionsMenuKind;
}

export function SectionActionsMenuItems({
	sectionId,
	color,
	kind,
	onRename,
	onSetColor,
	onDelete,
}: SectionActionsMenuItemsProps) {
	const collections = useCollections();
	const { moveSectionToParent } = useDashboardSidebarState();

	// Valid re-parent targets come from the same predicate the mutation
	// enforces (scope, cycles, depth cap), so the menu never offers a move
	// the mutation would refuse.
	const { moveTargets, isNested } = useMemo(() => {
		const sections = Array.from(collections.v2SidebarSections.state.values());
		const self = sections.find((row) => row.sectionId === sectionId);
		if (!self) return { moveTargets: [], isNested: false };
		return {
			isNested: self.parentSectionId !== null,
			moveTargets: sections
				.filter(
					(row) =>
						row.sectionId !== sectionId &&
						canMoveSectionToParent(collections, sectionId, row.sectionId),
				)
				.sort((left, right) => left.name.localeCompare(right.name))
				.map((row) => ({
					id: row.sectionId,
					name: row.name,
					color: row.color,
				})),
		};
	}, [collections, sectionId]);

	const selectedValue = color ?? PROJECT_COLOR_DEFAULT;
	const colorOptions = [
		{ name: "Default", value: PROJECT_COLOR_DEFAULT },
		...PROJECT_COLORS,
	];
	const iconClassName = kind === "context" ? "size-4 mr-2" : "size-4";

	const renderItem = ({
		children,
		destructive = false,
		key,
		onSelect,
	}: {
		children: React.ReactNode;
		destructive?: boolean;
		key?: string;
		onSelect?: () => void;
	}) => {
		if (kind === "context") {
			return (
				<ContextMenuItem
					key={key}
					onSelect={(event) => {
						event.stopPropagation();
						onSelect?.();
					}}
					className={
						destructive ? "text-destructive focus:text-destructive" : undefined
					}
				>
					{children}
				</ContextMenuItem>
			);
		}

		return (
			<DropdownMenuItem
				key={key}
				onSelect={(event) => {
					event.stopPropagation();
					onSelect?.();
				}}
				variant={destructive ? "destructive" : "default"}
			>
				{children}
			</DropdownMenuItem>
		);
	};

	const colorItems = colorOptions.map((projectColor) => {
		const isDefault = projectColor.value === PROJECT_COLOR_DEFAULT;
		const isSelected = selectedValue === projectColor.value;

		return renderItem({
			key: projectColor.value,
			onSelect: () => onSetColor(isDefault ? null : projectColor.value),
			children: (
				<>
					<span
						className="relative inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border border-border/50"
						style={
							isDefault ? undefined : { backgroundColor: projectColor.value }
						}
					>
						{isDefault ? (
							<span className="size-1.5 rounded-full bg-muted-foreground/35" />
						) : null}
					</span>
					<span>{projectColor.name}</span>
					{isSelected ? (
						<HiCheck className="ml-auto size-3.5 text-muted-foreground" />
					) : null}
				</>
			),
		});
	});
	const colorTrigger = (
		<>
			<LuPalette className={iconClassName} />
			Set group color
		</>
	);

	return (
		<>
			{renderItem({
				onSelect: onRename,
				children: (
					<>
						<LuPencil className={iconClassName} />
						Rename group
					</>
				),
			})}
			{kind === "context" ? (
				<ContextMenuSub>
					<ContextMenuSubTrigger>{colorTrigger}</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-40 max-h-80 overflow-y-auto">
						{colorItems}
					</ContextMenuSubContent>
				</ContextMenuSub>
			) : (
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>{colorTrigger}</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="w-40 max-h-80 overflow-y-auto">
						{colorItems}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
			)}
			{moveTargets.length > 0 &&
				(kind === "context" ? (
					<ContextMenuSub>
						<ContextMenuSubTrigger>
							<LuArrowRightLeft className={iconClassName} />
							Move to group
						</ContextMenuSubTrigger>
						<ContextMenuSubContent className="w-44 max-h-80 overflow-y-auto">
							{moveTargets.map((target) =>
								renderItem({
									key: target.id,
									onSelect: () => moveSectionToParent(sectionId, target.id),
									children: <span className="truncate">{target.name}</span>,
								}),
							)}
						</ContextMenuSubContent>
					</ContextMenuSub>
				) : (
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<LuArrowRightLeft className={iconClassName} />
							Move to group
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="w-44 max-h-80 overflow-y-auto">
							{moveTargets.map((target) =>
								renderItem({
									key: target.id,
									onSelect: () => moveSectionToParent(sectionId, target.id),
									children: <span className="truncate">{target.name}</span>,
								}),
							)}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				))}
			{isNested &&
				renderItem({
					onSelect: () => moveSectionToParent(sectionId, null),
					children: (
						<>
							<LuArrowUp className={iconClassName} />
							Move to top level
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
						<LuTrash2
							className={
								kind === "context"
									? "size-4 mr-2 text-destructive"
									: "size-4 text-destructive"
							}
						/>
						Delete group
					</>
				),
			})}
		</>
	);
}
