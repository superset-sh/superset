import { Trans, useLingui } from "@lingui/react/macro";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { LuLayers } from "react-icons/lu";
import { FormPickerTrigger } from "../FormPickerTrigger";

export interface EnvironmentOption {
	id: string;
	name: string;
}

interface EnvironmentPickerPillProps {
	selectedEnvironment: EnvironmentOption | undefined;
	environments: EnvironmentOption[];
	onSelectEnvironment: (environmentId: string) => void;
}

export function EnvironmentPickerPill({
	selectedEnvironment,
	environments,
	onSelectEnvironment,
}: EnvironmentPickerPillProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<FormPickerTrigger className="max-w-[140px]">
					<LuLayers className="size-4 shrink-0 text-muted-foreground" />
					<span className="truncate">
						{selectedEnvironment?.name ??
							t({
								message: "Select environment",
							})}
					</span>
					<HiChevronUpDown className="size-3 shrink-0" />
				</FormPickerTrigger>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-60 p-0"
				onWheel={(event) => event.stopPropagation()}
			>
				<Command>
					<CommandInput
						placeholder={t({
							message: "Search environments...",
						})}
					/>
					<CommandList className="max-h-[min(280px,var(--radix-popover-content-available-height))]">
						<CommandEmpty>
							<Trans>No environments found.</Trans>
						</CommandEmpty>
						<CommandGroup>
							{environments.map((environment) => (
								<CommandItem
									key={environment.id}
									value={environment.name}
									onSelect={() => {
										onSelectEnvironment(environment.id);
										setOpen(false);
									}}
								>
									<LuLayers className="size-4 text-muted-foreground" />
									<span className="flex-1 truncate">{environment.name}</span>
									{environment.id === selectedEnvironment?.id && (
										<HiCheck className="size-4 shrink-0" />
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
