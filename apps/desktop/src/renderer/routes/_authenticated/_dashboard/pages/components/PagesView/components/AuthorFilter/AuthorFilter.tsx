import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
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
import { cn } from "@superset/ui/utils";
import { Check, ChevronDown, CircleUserRound } from "lucide-react";
import { useState } from "react";

export interface PageAuthorOption {
	userId: string;
	name: string;
	image: string | null;
	isCurrentUser: boolean;
}

interface AuthorFilterProps {
	value: string | null;
	options: PageAuthorOption[];
	onChange: (value: string | null) => void;
}

function AuthorAvatar({ option }: { option: PageAuthorOption }) {
	return (
		<Avatar className="size-4 shrink-0">
			{option.image ? <AvatarImage src={option.image} alt="" /> : null}
			<AvatarFallback className="text-[8px]">
				{option.name.slice(0, 1).toUpperCase()}
			</AvatarFallback>
		</Avatar>
	);
}

export function AuthorFilter({ value, options, onChange }: AuthorFilterProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);

	const optionLabel = (option: PageAuthorOption) =>
		option.isCurrentUser
			? t({
					message: `${option.name} (you)`,
				})
			: option.name;

	const selected = options.find((option) => option.userId === value) ?? null;
	const label = selected
		? optionLabel(selected)
		: value
			? t({
					message: "Unknown author",
				})
			: t({
					message: "All authors",
				});

	const select = (next: string | null) => {
		onChange(next);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					title={label}
					aria-label={t({
						message: `Filter by author: ${label}`,
					})}
					className={cn(
						"h-8 max-w-44 gap-1.5 px-2.5 font-normal",
						value ? "text-foreground" : "text-muted-foreground",
					)}
				>
					{selected ? (
						<AuthorAvatar option={selected} />
					) : (
						<CircleUserRound className="size-4 shrink-0" />
					)}
					<span className="truncate text-sm">{label}</span>
					<ChevronDown className="size-3 shrink-0" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64 p-0">
				<Command>
					<CommandInput
						placeholder={t({
							message: "Search authors…",
						})}
					/>
					<CommandList className="max-h-72">
						<CommandEmpty>
							<Trans>No authors found.</Trans>
						</CommandEmpty>
						<CommandGroup>
							<CommandItem
								aria-checked={value === null}
								onSelect={() => select(null)}
							>
								<CircleUserRound className="size-4 shrink-0" />
								<span className="text-sm">
									<Trans>All authors</Trans>
								</span>
								{value === null && (
									<Check className="ml-auto size-3.5 shrink-0" />
								)}
							</CommandItem>
							{options.map((option) => (
								<CommandItem
									key={option.userId}
									value={`${option.name} ${option.userId}`}
									aria-checked={value === option.userId}
									onSelect={() => select(option.userId)}
								>
									<AuthorAvatar option={option} />
									<span className="truncate text-sm">
										{optionLabel(option)}
									</span>
									{value === option.userId && (
										<Check className="ml-auto size-3.5 shrink-0" />
									)}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
