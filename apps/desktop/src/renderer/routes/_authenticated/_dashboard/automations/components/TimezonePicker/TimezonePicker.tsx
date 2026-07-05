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
import { HiCheck } from "react-icons/hi2";
import { LuGlobe } from "react-icons/lu";
import { PickerTrigger } from "renderer/components/PickerTrigger";

interface TimezonePickerProps {
	value: string;
	onChange: (timezone: string) => void;
	className?: string;
}

function listTimezones(): string[] {
	const supported =
		typeof Intl.supportedValuesOf === "function"
			? Intl.supportedValuesOf("timeZone")
			: [];
	return supported.length > 0 ? supported : ["UTC"];
}

export function TimezonePicker({
	value,
	onChange,
	className,
}: TimezonePickerProps) {
	const [open, setOpen] = useState(false);
	const timezones = useMemo(listTimezones, []);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<PickerTrigger
					className={className}
					icon={<LuGlobe className="size-4 shrink-0" />}
					label={value}
				/>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="top"
				sideOffset={8}
				className="w-64 p-0"
			>
				<Command>
					<CommandInput placeholder="Search timezones..." />
					<CommandList>
						<CommandEmpty>No matching timezone.</CommandEmpty>
						<CommandGroup>
							{timezones.map((tz) => (
								<CommandItem
									key={tz}
									value={tz}
									onSelect={() => {
										onChange(tz);
										setOpen(false);
									}}
								>
									<span className="truncate">{tz}</span>
									{tz === value && <HiCheck className="ml-auto size-4" />}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
