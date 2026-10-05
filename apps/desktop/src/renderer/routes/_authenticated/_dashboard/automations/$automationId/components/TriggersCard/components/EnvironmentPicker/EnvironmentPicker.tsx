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
import { HiCheck } from "react-icons/hi2";
import { LuLayers } from "react-icons/lu";
import { PickerTrigger } from "renderer/components/PickerTrigger";

interface EnvironmentPickerProps {
	environments: { id: string; name: string }[];
	value: string | null;
	onChange: (environmentId: string) => void;
	className?: string;
	disabled?: boolean;
}

export function EnvironmentPicker({
	environments,
	value,
	onChange,
	className,
	disabled,
}: EnvironmentPickerProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const selected = environments.find((row) => row.id === value);

	return (
		<Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
			<PopoverTrigger asChild>
				<PickerTrigger
					disabled={disabled}
					className={className}
					icon={<LuLayers className="size-4 shrink-0" />}
					label={
						selected?.name ??
						t({
							message: "Select environment",
						})
					}
				/>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-60 p-0">
				<Command>
					<CommandInput
						placeholder={t({
							message: "Search environments...",
						})}
					/>
					<CommandList>
						<CommandEmpty>
							<Trans>No environments found.</Trans>
						</CommandEmpty>
						<CommandGroup>
							{environments.map((environment) => (
								<CommandItem
									key={environment.id}
									value={environment.name}
									onSelect={() => {
										onChange(environment.id);
										setOpen(false);
									}}
								>
									<LuLayers className="size-4 shrink-0" />
									<span className="truncate">{environment.name}</span>
									{environment.id === value && (
										<HiCheck className="ml-auto size-4" />
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
