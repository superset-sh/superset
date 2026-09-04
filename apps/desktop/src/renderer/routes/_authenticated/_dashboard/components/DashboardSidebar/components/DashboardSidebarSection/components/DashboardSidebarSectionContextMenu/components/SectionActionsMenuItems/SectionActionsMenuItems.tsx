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
import { HiCheck } from "react-icons/hi2";
import { LuEyeOff, LuPalette, LuPencil, LuTrash2 } from "react-icons/lu";
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
	color,
	kind,
	onRename,
	onSetColor,
	onDelete,
	onHide,
}: SectionActionsMenuItemsProps) {
	const { t } = useLingui();
	const selectedValue = color ?? PROJECT_COLOR_DEFAULT;
	const colorOptions: { name: string; value: string }[] = [
		{
			name: t({
				message: "Default",
			}),
			value: PROJECT_COLOR_DEFAULT,
		},
		...PROJECT_COLORS.map((projectColor) => ({
			name: projectColor.name(),
			value: projectColor.value,
		})),
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
			onSelect: () => onSetColor?.(isDefault ? null : projectColor.value),
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
			<Trans>Set group color</Trans>
		</>
	);

	return (
		<>
			{renderItem({
				onSelect: onRename,
				children: (
					<>
						<LuPencil className={iconClassName} />
						<Trans>Rename group</Trans>
					</>
				),
			})}
			{onSetColor && kind === "context" ? (
				<ContextMenuSub>
					<ContextMenuSubTrigger>{colorTrigger}</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-40 max-h-80 overflow-y-auto">
						{colorItems}
					</ContextMenuSubContent>
				</ContextMenuSub>
			) : onSetColor ? (
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>{colorTrigger}</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="w-40 max-h-80 overflow-y-auto">
						{colorItems}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
			) : null}
			{onHide
				? renderItem({
						onSelect: onHide,
						children: (
							<>
								<LuEyeOff className={iconClassName} />
								<Trans>Hide folder</Trans>
							</>
						),
					})
				: null}
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
						<Trans>Delete group</Trans>
					</>
				),
			})}
		</>
	);
}
