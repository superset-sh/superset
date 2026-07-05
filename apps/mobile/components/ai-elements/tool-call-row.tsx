import type { LucideIcon } from "lucide-react-native";
import {
	ChevronDownIcon,
	ChevronRightIcon,
	TriangleAlertIcon,
	XCircleIcon,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { useState } from "react";
import { View } from "react-native";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { BrailleSpinner } from "./braille-spinner";

export type ToolCallRowProps = {
	/** Icon shown in the header. */
	icon: LucideIcon;
	/**
	 * Header title. A plain string is rendered as mono text. Any other ReactNode
	 * is rendered as-is (useful when the title contains interactive elements
	 * like clickable file paths).
	 */
	title: ReactNode;
	/** Optional muted text rendered after the title, truncated when too long. */
	description?: ReactNode;
	/** When true the default leading slot shows a spinner. */
	isPending?: boolean;
	/** When true the default status shows an X icon. */
	isError?: boolean;
	/** When true shows an amber warning triangle inline after the description. */
	isNotConfigured?: boolean;
	/**
	 * Overrides the default status slot (X on error, nothing otherwise).
	 * Pass `null` to render nothing. Omit (undefined) to use the default.
	 */
	statusNode?: ReactNode;
	/**
	 * Extra element placed outside (after) the CollapsibleTrigger — useful for
	 * action buttons that must not toggle expansion when pressed.
	 */
	headerExtra?: ReactNode;
	/** Expandable content rendered inside the collapsible area with the left border. */
	children?: ReactNode;
	className?: string;
};

/**
 * Shared collapsible row used by every tool call type.
 *
 * Provides a consistent layout:
 *   [icon/spinner]  [title]  [description ...]  |  [status]  [chevron]  [headerExtra?]
 *   └── collapsible content with left border ──────────────────────────────────────┘
 */
export function ToolCallRow({
	icon: IconComponent,
	title,
	description,
	isPending = false,
	isError = false,
	isNotConfigured = false,
	statusNode,
	headerExtra,
	children,
	className,
}: ToolCallRowProps) {
	const [isOpen, setIsOpen] = useState(false);
	const hasDetails = children != null && children !== false;

	const defaultStatus = isError ? (
		<Icon as={XCircleIcon} className="size-3 text-red-500" />
	) : null;

	const resolvedDescription =
		description ??
		(isError ? (
			<View className="ml-2 flex-row items-center gap-1">
				<Icon as={XCircleIcon} className="size-3 shrink-0 text-red-500" />
				<Text className="font-medium font-mono text-red-500 text-xs uppercase tracking-wide">
					Error
				</Text>
			</View>
		) : null);

	const titleContent =
		typeof title === "string" ? (
			<Text className="shrink-0 font-mono text-foreground text-xs">
				{title}
			</Text>
		) : (
			title
		);

	return (
		<Collapsible
			className={cn("-mx-1 rounded-md", className)}
			onOpenChange={(open) => hasDetails && setIsOpen(open)}
			open={hasDetails ? isOpen : false}
		>
			<View className="flex-row items-center">
				<CollapsibleTrigger
					className="h-7 min-w-0 flex-1 flex-row items-center justify-between rounded-md px-1"
					disabled={!hasDetails}
				>
					<View className="min-w-0 flex-1 flex-row items-center gap-1.5">
						{isPending ? (
							<View className="size-3 shrink-0 items-center justify-center overflow-hidden">
								<BrailleSpinner className="text-xs" />
							</View>
						) : (
							<Icon
								as={IconComponent}
								className="size-3 shrink-0 text-muted-foreground"
							/>
						)}
						{titleContent}
						{(resolvedDescription != null || isNotConfigured) && !isOpen ? (
							<View className="min-w-0 flex-1 flex-row items-center gap-1">
								{resolvedDescription != null ? (
									typeof resolvedDescription === "string" ? (
										<Text
											className="min-w-0 shrink font-mono text-muted-foreground text-xs"
											numberOfLines={1}
										>
											{resolvedDescription}
										</Text>
									) : (
										resolvedDescription
									)
								) : null}
								{isNotConfigured ? (
									<View
										accessibilityLabel="Not configured"
										className="shrink-0"
									>
										<Icon
											as={TriangleAlertIcon}
											className="size-3 text-amber-500"
										/>
									</View>
								) : null}
							</View>
						) : null}
					</View>
					<View className="ml-2 shrink-0 flex-row items-center gap-1">
						{statusNode !== undefined ? statusNode : defaultStatus}
						{hasDetails ? (
							<Icon
								as={isOpen ? ChevronDownIcon : ChevronRightIcon}
								className="size-3 text-muted-foreground"
							/>
						) : null}
					</View>
				</CollapsibleTrigger>
				{headerExtra}
			</View>
			{hasDetails ? (
				<CollapsibleContent>
					<View className="ml-2.5 border-border border-l">{children}</View>
				</CollapsibleContent>
			) : null}
		</Collapsible>
	);
}
