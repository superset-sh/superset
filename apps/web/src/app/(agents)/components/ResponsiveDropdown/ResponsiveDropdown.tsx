"use client";

import { Drawer, DrawerContent, DrawerTitle } from "@superset/ui/drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useIsMobile } from "@superset/ui/hooks/use-mobile";
import {
	cloneElement,
	isValidElement,
	type MouseEvent,
	type ReactNode,
	useState,
} from "react";

type DropdownItem = {
	label: string;
	icon?: ReactNode;
	onSelect: () => void;
	className?: string;
};

type ResponsiveDropdownProps = {
	trigger: ReactNode;
	items: DropdownItem[];
	align?: "start" | "center" | "end";
	side?: "top" | "bottom" | "left" | "right";
	title?: string;
	contentClassName?: string;
	onCloseAutoFocus?: (e: Event) => void;
};

export function ResponsiveDropdown({
	trigger,
	items,
	align = "start",
	side,
	title,
	contentClassName,
	onCloseAutoFocus,
}: ResponsiveDropdownProps) {
	const isMobile = useIsMobile();
	const [open, setOpen] = useState(false);

	if (isMobile) {
		const mobileTrigger = isValidElement<{
			onClick?: (event: MouseEvent<HTMLElement>) => void;
		}>(trigger)
			? cloneElement(trigger, {
					onClick: (event: MouseEvent<HTMLElement>) => {
						trigger.props.onClick?.(event);
						if (!event.defaultPrevented) {
							setOpen(true);
						}
					},
				})
			: trigger;

		return (
			<>
				{mobileTrigger}
				<Drawer open={open} onOpenChange={setOpen}>
					<DrawerContent>
						<DrawerTitle className="sr-only">{title ?? "Menu"}</DrawerTitle>
						<div className="flex flex-col gap-1 p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
							{items.map((item) => (
								<button
									key={item.label}
									type="button"
									className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-accent ${item.className ?? ""}`}
									onClick={() => {
										item.onSelect();
										setOpen(false);
									}}
								>
									{item.icon}
									<span>{item.label}</span>
								</button>
							))}
						</div>
					</DrawerContent>
				</Drawer>
			</>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
			<DropdownMenuContent
				align={align}
				side={side}
				className={contentClassName}
				onCloseAutoFocus={onCloseAutoFocus}
			>
				{items.map((item) => (
					<DropdownMenuItem
						key={item.label}
						onSelect={item.onSelect}
						className={`gap-2 ${item.className ?? ""}`}
					>
						{item.icon}
						<span>{item.label}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
