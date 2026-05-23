import type { ReactNode } from "react";
import { Fragment } from "react";
import { View, type ViewProps } from "react-native";
import { RadioGroup } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type PickerPopoverItem = {
	id: string;
	label: string;
	hint?: string;
	badge?: ReactNode;
};

export type PickerPopoverSection = {
	id: string;
	label?: string;
	items: ReadonlyArray<PickerPopoverItem>;
};

export type PickerPopoverProps = ViewProps & {
	open: boolean;
	sections: ReadonlyArray<PickerPopoverSection>;
	selectedId: string | undefined;
	onChange: (id: string) => void;
	/**
	 * Optional renderer for the body of a single row — receives the item +
	 * selected flag. When omitted, uses the default label + optional hint row.
	 * Useful for stories/callers that want to inject ModelPickerOption or
	 * ThinkingLevelOption molecules directly.
	 */
	renderItem?: (item: PickerPopoverItem, isSelected: boolean) => ReactNode;
};

/**
 * Generic radio-style picker popover with optional sections. Used by:
 *  - ModelPicker (Anthropic / OpenAI sections of ModelPickerOption) — UC-COMP-04
 *  - ThinkingLevelPicker (ThinkingLevelOption rows) — UC-COMP-05
 *  - PermissionMode picker (ThinkingLevelOption rows, kind="permission")
 *
 * Composes vendor RadioGroup + Separator. The actual option molecule is
 * injected by the caller via `renderItem` so this organism stays usage-agnostic.
 */
export function PickerPopover({
	open,
	sections,
	selectedId,
	onChange,
	renderItem,
	className,
	...props
}: PickerPopoverProps) {
	if (!open) return null;

	return (
		<View
			accessibilityRole="menu"
			className={cn(
				"bg-popover border border-border rounded-2xl shadow-lg overflow-hidden",
				className,
			)}
			{...props}
		>
			<RadioGroup value={selectedId ?? ""} onValueChange={onChange}>
				{sections.map((section, sectionIdx) => (
					<Fragment key={section.id}>
						{sectionIdx > 0 ? <Separator className="my-1" /> : null}
						{section.label ? (
							<View className="px-4 pt-3 pb-1">
								<Text
									variant="muted"
									className="text-xs font-mono uppercase tracking-wider"
								>
									{section.label}
								</Text>
							</View>
						) : null}
						{section.items.map((item) =>
							renderItem ? (
								<Fragment key={item.id}>
									{renderItem(item, item.id === selectedId)}
								</Fragment>
							) : (
								<DefaultRow
									key={item.id}
									item={item}
									isSelected={item.id === selectedId}
								/>
							),
						)}
					</Fragment>
				))}
			</RadioGroup>
		</View>
	);
}

function DefaultRow({
	item,
	isSelected,
}: {
	item: PickerPopoverItem;
	isSelected: boolean;
}) {
	return (
		<View
			className={cn(
				"flex-row items-center justify-between px-4 py-3 min-h-touch-min",
				isSelected ? "bg-accent" : "",
			)}
		>
			<View className="flex-1">
				<Text className="text-foreground">{item.label}</Text>
				{item.hint ? (
					<Text variant="muted" className="text-xs">
						{item.hint}
					</Text>
				) : null}
			</View>
			{item.badge}
		</View>
	);
}
