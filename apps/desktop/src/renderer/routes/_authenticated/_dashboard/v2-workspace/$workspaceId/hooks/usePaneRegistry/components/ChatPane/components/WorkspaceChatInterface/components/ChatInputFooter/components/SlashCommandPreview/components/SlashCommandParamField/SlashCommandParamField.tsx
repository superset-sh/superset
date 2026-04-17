import { Input } from "@superset/ui/input";
import type { ParamField } from "../../slash-command-preview.model";

interface SlashCommandParamFieldProps {
	field: ParamField;
	value: string;
	required: boolean;
	onChange: (value: string) => void;
}

function getInputId(field: ParamField): string {
	return `slash-param-${field.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function SlashCommandParamField({
	field,
	value,
	required,
	onChange,
}: SlashCommandParamFieldProps) {
	const inputId = getInputId(field);

	return (
		<label className="space-y-1" htmlFor={inputId}>
			<div className="flex items-center gap-1 text-[11px] text-muted-foreground uppercase tracking-wide">
				<span>{field.label}</span>
				{required ? (
					<span className="text-destructive">*</span>
				) : (
					<span className="normal-case text-[10px] text-muted-foreground/80">
						optional
					</span>
				)}
			</div>
			<Input
				aria-required={required}
				className="h-8 font-mono text-xs"
				id={inputId}
				onChange={(event) => onChange(event.target.value)}
				placeholder={
					required ? `Set ${field.label}` : `Set ${field.label} (optional)`
				}
				value={value}
			/>
		</label>
	);
}
