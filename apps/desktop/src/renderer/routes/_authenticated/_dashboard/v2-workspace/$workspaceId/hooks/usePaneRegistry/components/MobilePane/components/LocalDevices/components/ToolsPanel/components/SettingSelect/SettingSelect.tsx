import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";

interface SettingSelectProps {
	label: string;
	value: string;
	options: Array<{ value: string; label: string }>;
	disabled?: boolean;
	onChange: (value: string) => void;
}

export function SettingSelect({
	label,
	value,
	options,
	disabled,
	onChange,
}: SettingSelectProps) {
	return (
		<Select value={value} onValueChange={onChange} disabled={disabled}>
			<SelectTrigger
				size="sm"
				aria-label={label}
				className="max-w-40 gap-1.5 px-2 text-xs data-[size=sm]:h-7"
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent align="end">
				{options.map((option) => (
					<SelectItem
						key={option.value}
						value={option.value}
						className="text-xs"
					>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
