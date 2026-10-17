import { DropdownMenuCheckboxItem } from "@superset/ui/dropdown-menu";
import type { Tab } from "../../../../../../../../../types";
import type { PaneRegistry } from "../../../../../../../../types";
import { useTabTitle } from "../../../../../../utils/useTabTitle";

interface TabOverflowMenuItemProps<TData> {
	tab: Tab<TData>;
	tabs: Tab<TData>[];
	registry: PaneRegistry<TData>;
	isActive: boolean;
	onSelect: () => void;
}

export function TabOverflowMenuItem<TData>({
	tab,
	tabs,
	registry,
	isActive,
	onSelect,
}: TabOverflowMenuItemProps<TData>) {
	const title = useTabTitle(tab, tabs, registry);

	return (
		<DropdownMenuCheckboxItem
			checked={isActive}
			indicator="end"
			onSelect={onSelect}
		>
			<span className="min-w-0 truncate">{title}</span>
		</DropdownMenuCheckboxItem>
	);
}
