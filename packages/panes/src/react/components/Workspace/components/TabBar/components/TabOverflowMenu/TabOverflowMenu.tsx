import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { ChevronDownIcon } from "lucide-react";
import type { Tab } from "../../../../../../../types";
import type { PaneRegistry } from "../../../../../../types";
import { TabOverflowMenuItem } from "./components/TabOverflowMenuItem";

interface TabOverflowMenuProps<TData> {
	tabs: Tab<TData>[];
	activeTabId: string | null;
	registry: PaneRegistry<TData>;
	onSelectTab: (tabId: string) => void;
}

export function TabOverflowMenu<TData>({
	tabs,
	activeTabId,
	registry,
	onSelectTab,
}: TabOverflowMenuProps<TData>) {
	const { t } = useLingui();
	const label = t({ message: "All tabs" });

	return (
		<DropdownMenu>
			<Tooltip delayDuration={500}>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<Button
							aria-label={label}
							className="size-7 rounded-md border border-border/60 bg-muted/30 px-1 text-muted-foreground shadow-none hover:bg-accent/60 hover:text-foreground"
							size="icon"
							type="button"
							variant="ghost"
						>
							<ChevronDownIcon className="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">{label}</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="end" className="w-56">
				{tabs.map((tab) => (
					<TabOverflowMenuItem
						key={tab.id}
						tab={tab}
						tabs={tabs}
						registry={registry}
						isActive={tab.id === activeTabId}
						onSelect={() => onSelectTab(tab.id)}
					/>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
