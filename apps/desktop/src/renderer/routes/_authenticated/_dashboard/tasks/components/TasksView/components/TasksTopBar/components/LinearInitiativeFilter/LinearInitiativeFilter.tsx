import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useMemo, useState } from "react";
import {
	HiArrowPath,
	HiCheck,
	HiChevronDown,
	HiOutlineFlag,
} from "react-icons/hi2";
import type { LinearInitiative } from "../../../../hooks/useLinearInitiatives";

interface LinearInitiativeFilterProps {
	initiatives: LinearInitiative[];
	value: string | null;
	onChange: (value: string | null) => void;
	isLoading: boolean;
	isError: boolean;
	onRetry: () => void;
}

export function LinearInitiativeFilter({
	initiatives,
	value,
	onChange,
	isLoading,
	isError,
	onRetry,
}: LinearInitiativeFilterProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const selected = useMemo(
		() =>
			value
				? (initiatives.find((initiative) => initiative.id === value) ?? null)
				: null,
		[value, initiatives],
	);
	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return initiatives;
		return initiatives.filter((initiative) =>
			initiative.name.toLowerCase().includes(query),
		);
	}, [initiatives, search]);

	const handleSelect = (id: string | null) => {
		onChange(id);
		setOpen(false);
		setSearch("");
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setSearch("");
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title={selected?.name ?? "Initiative"}
					aria-label={selected?.name ?? "Initiative"}
					className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					{isLoading ? (
						<HiArrowPath className="size-4 animate-spin motion-reduce:animate-none" />
					) : (
						<HiOutlineFlag className="size-4" />
					)}
					<span className="hidden text-sm @4xl:inline">
						{selected?.name ?? "Initiative"}
					</span>
					<HiChevronDown className="size-3" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-0">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search initiatives..."
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList className="max-h-80">
						{isError ? (
							<div className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-muted-foreground">
								<span>Couldn’t load initiatives.</span>
								<Button variant="ghost" size="xs" onClick={onRetry}>
									Retry
								</Button>
							</div>
						) : (
							<>
								{filtered.length === 0 && !isLoading && (
									<CommandEmpty>
										{search
											? "No initiatives found."
											: "No initiatives in this workspace."}
									</CommandEmpty>
								)}
								<CommandGroup>
									{!search && (
										<CommandItem onSelect={() => handleSelect(null)}>
											<HiOutlineFlag className="size-4 shrink-0" />
											<span className="truncate text-sm">All initiatives</span>
											{value === null && (
												<HiCheck className="ml-auto size-3.5 shrink-0" />
											)}
										</CommandItem>
									)}
									{filtered.map((initiative) => (
										<CommandItem
											key={initiative.id}
											onSelect={() => handleSelect(initiative.id)}
										>
											<HiOutlineFlag className="size-4 shrink-0" />
											<span className="truncate text-sm">
												{initiative.name}
											</span>
											{initiative.id === value && (
												<HiCheck className="ml-auto size-3.5 shrink-0" />
											)}
										</CommandItem>
									))}
								</CommandGroup>
							</>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
