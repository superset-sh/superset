import { Button } from "@superset/ui/button";
import {
	CommandDialog,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Input } from "@superset/ui/input";
import { Spinner } from "@superset/ui/spinner";
import type { ReactNode } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";

export interface SearchDialogItem {
	id: string;
}

interface SearchDialogProps<TItem extends SearchDialogItem> {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	query: string;
	onQueryChange: (query: string) => void;
	queryPlaceholder: string;
	filtersOpen: boolean;
	onFiltersOpenChange: (open: boolean) => void;
	includePattern: string;
	onIncludePatternChange: (value: string) => void;
	excludePattern: string;
	onExcludePatternChange: (value: string) => void;
	emptyMessage: string;
	isLoading: boolean;
	results: TItem[];
	getItemValue: (item: TItem) => string;
	onSelectItem: (item: TItem) => void;
	renderItem: (item: TItem) => ReactNode;
}

export function SearchDialog<TItem extends SearchDialogItem>({
	open,
	onOpenChange,
	title,
	description,
	query,
	onQueryChange,
	queryPlaceholder,
	filtersOpen,
	onFiltersOpenChange,
	includePattern,
	onIncludePatternChange,
	excludePattern,
	onExcludePatternChange,
	emptyMessage,
	isLoading,
	results,
	getItemValue,
	onSelectItem,
	renderItem,
}: SearchDialogProps<TItem>) {
	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title={title}
			description={description}
			showCloseButton={false}
		>
			<div className="relative">
				<CommandInput
					placeholder={queryPlaceholder}
					value={query}
					onValueChange={onQueryChange}
					className="pr-9"
				/>
				<div className="pointer-events-none absolute top-2 right-2 z-10">
					{isLoading ? (
						<div className="pointer-events-none absolute top-1 right-8">
							<Spinner className="size-4 text-muted-foreground" />
						</div>
					) : null}
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-7 pointer-events-auto"
						aria-label={filtersOpen ? "Hide Filters" : "Show Filters"}
						aria-expanded={filtersOpen}
						onClick={() => onFiltersOpenChange(!filtersOpen)}
					>
						{filtersOpen ? (
							<LuChevronDown className="size-4" />
						) : (
							<LuChevronRight className="size-4" />
						)}
					</Button>
				</div>
			</div>
			{filtersOpen ? (
				<div className="grid grid-cols-2 gap-2 border-b px-3 py-2">
					<Input
						value={includePattern}
						onChange={(event) => onIncludePatternChange(event.target.value)}
						placeholder="files to include (glob)"
						className="h-8 text-xs"
					/>
					<Input
						value={excludePattern}
						onChange={(event) => onExcludePatternChange(event.target.value)}
						placeholder="files to exclude (glob)"
						className="h-8 text-xs"
					/>
				</div>
			) : null}
			<CommandList>
				{query.trim().length > 0 && !isLoading && results.length === 0 && (
					<CommandEmpty>{emptyMessage}</CommandEmpty>
				)}
				{results.map((item) => (
					<CommandItem
						key={item.id}
						value={getItemValue(item)}
						onSelect={() => onSelectItem(item)}
					>
						{renderItem(item)}
					</CommandItem>
				))}
			</CommandList>
		</CommandDialog>
	);
}
