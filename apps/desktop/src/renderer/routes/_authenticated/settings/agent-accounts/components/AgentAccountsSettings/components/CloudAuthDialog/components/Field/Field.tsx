import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useId } from "react";

export function Field({
	label,
	placeholder,
	value,
	onChange,
}: {
	label: string;
	placeholder?: string;
	value?: string;
	onChange?: (value: string) => void;
}) {
	const id = useId();
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Input
				autoComplete="off"
				className="font-mono text-sm"
				id={id}
				onChange={(e) => onChange?.(e.target.value)}
				placeholder={placeholder}
				value={value ?? ""}
			/>
		</div>
	);
}
