import {
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";

/** The option row every pull request menu uses: 10px radius, small UI text,
 *  3.5 glyphs at 80% ink until highlighted. */
const ROW_CLASS_NAME =
	"gap-2 rounded-[0.625rem] px-2.5 py-1.5 text-xs text-foreground focus:bg-secondary focus:text-foreground data-[disabled]:opacity-60 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-foreground [&_svg]:opacity-80 focus:[&_svg]:opacity-100";

/** Frosted panel: a translucent popover fill blurred over the page, a 14px radius, a soft shadow. */
export function PullRequestMenuContent({
	className,
	sideOffset = 6,
	...props
}: ComponentProps<typeof DropdownMenuContent>) {
	return (
		<DropdownMenuContent
			sideOffset={sideOffset}
			className={cn(
				"min-w-48 rounded-[0.875rem] border-border bg-popover/70 p-1 text-foreground shadow-[0_4px_18px_-6px_color-mix(in_srgb,var(--foreground)_7%,transparent)] backdrop-blur-2xl backdrop-saturate-150 [.dark_&]:shadow-[0_6px_24px_-10px_rgba(0,0,0,0.30)]",
				className,
			)}
			{...props}
		/>
	);
}

export function PullRequestMenuItem({
	className,
	...props
}: ComponentProps<typeof DropdownMenuItem>) {
	return (
		<DropdownMenuItem
			className={cn(
				ROW_CLASS_NAME,
				"data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:[&_svg]:!text-destructive",
				className,
			)}
			{...props}
		/>
	);
}

/** A radio row reads like any other row; the chosen one carries a check at its end. */
export function PullRequestMenuRadioItem({
	className,
	children,
	...props
}: ComponentProps<typeof DropdownMenuRadioItem>) {
	return (
		<DropdownMenuRadioItem
			className={cn(
				ROW_CLASS_NAME,
				"group pl-2.5 [&>span:first-child]:hidden",
				className,
			)}
			{...props}
		>
			{children}
			<Check
				aria-hidden
				strokeWidth={2}
				className="invisible ml-auto size-3 shrink-0 group-data-[state=checked]:visible"
			/>
		</DropdownMenuRadioItem>
	);
}

export function PullRequestMenuLabel({
	className,
	...props
}: ComponentProps<typeof DropdownMenuLabel>) {
	return (
		<DropdownMenuLabel
			className={cn(
				"px-2.5 py-1.5 text-xs font-normal leading-snug text-muted-foreground/60",
				className,
			)}
			{...props}
		/>
	);
}

export function PullRequestMenuSeparator({
	className,
	...props
}: ComponentProps<typeof DropdownMenuSeparator>) {
	return (
		<DropdownMenuSeparator
			className={cn("mx-2 my-1 bg-border", className)}
			{...props}
		/>
	);
}
