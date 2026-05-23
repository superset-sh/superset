import {
	Bot,
	Brain,
	ChevronDown,
	type LucideIcon,
	Sparkles,
} from "lucide-react-native";
import { type ReactNode, useState } from "react";
import { Pressable, View, type ViewProps } from "react-native";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type CollapsedBlockKind = "plan" | "reasoning" | "subagent";

type KindConfig = {
	icon: LucideIcon;
	label: string;
	iconColorClass: string;
	indentClass?: string;
};

const KIND: Record<CollapsedBlockKind, KindConfig> = {
	plan: { icon: Sparkles, label: "PLAN", iconColorClass: "text-primary" },
	reasoning: {
		icon: Brain,
		label: "REASONING",
		iconColorClass: "text-muted-foreground",
	},
	subagent: {
		icon: Bot,
		label: "SUBAGENT",
		iconColorClass: "text-muted-foreground",
		indentClass: "ml-6 border-l border-muted-foreground/40 pl-3",
	},
};

export type CollapsedBlockProps = ViewProps & {
	kind?: CollapsedBlockKind;
	meta?: string;
	defaultOpen?: boolean;
	children?: ReactNode;
};

/**
 * Collapsible block wrapping agent-generated structured content (UC-RENDER-05/06).
 *
 * Per mol-collapsed-block spec, 3 kinds:
 *  - plan      — sparkles + PLAN + accent icon, agent's proposed step list
 *  - reasoning — brain + REASONING + muted icon, extended thinking trace
 *  - subagent  — bot + SUBAGENT + muted, indented with left accent rule
 *
 * Tap on the summary toggles expand/collapse via vendor Collapsible primitives.
 * Chevron rotates 180° when open.
 *
 * Composes vendor Collapsible + Separator + Icon + Text.
 */
export function CollapsedBlock({
	kind = "plan",
	meta,
	defaultOpen = false,
	children,
	className,
	...props
}: CollapsedBlockProps) {
	const cfg = KIND[kind];
	const [open, setOpen] = useState(defaultOpen);

	return (
		<View className={cn(cfg.indentClass, className)} {...props}>
			<Collapsible open={open} onOpenChange={setOpen}>
				<CollapsibleTrigger asChild>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={`${cfg.label} block, ${open ? "expanded" : "collapsed"}`}
						accessibilityState={{ expanded: open }}
						className="flex-row items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border active:bg-accent"
					>
						<Icon as={cfg.icon} className={cn("size-4", cfg.iconColorClass)} />
						<Text className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
							{cfg.label}
						</Text>
						{meta ? (
							<Text className="flex-1 font-mono text-xs text-muted-foreground">
								· {meta}
							</Text>
						) : (
							<View className="flex-1" />
						)}
						<View
							className={cn("transition-transform", open ? "rotate-180" : "")}
						>
							<Icon as={ChevronDown} className="size-4 text-muted-foreground" />
						</View>
					</Pressable>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<View className="px-3 py-2 mt-1 rounded-lg bg-card border border-border gap-1">
						<Separator className="mb-1" />
						{children}
					</View>
				</CollapsibleContent>
			</Collapsible>
		</View>
	);
}
