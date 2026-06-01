import { Badge } from "@superset/ui/badge";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import { HiXMark } from "react-icons/hi2";

interface CreateTaskLabelsInputProps {
	value: string[];
	onChange: (value: string[]) => void;
	disabled?: boolean;
}

function normalizeLabel(value: string): string {
	return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

export function CreateTaskLabelsInput({
	value,
	onChange,
	disabled = false,
}: CreateTaskLabelsInputProps) {
	const [input, setInput] = useState("");

	const addLabel = (raw: string) => {
		const label = normalizeLabel(raw);
		if (!label) return;
		if (value.some((item) => item.toLowerCase() === label.toLowerCase())) {
			setInput("");
			return;
		}
		onChange([...value, label]);
		setInput("");
	};

	const removeLabel = (label: string) => {
		onChange(value.filter((item) => item !== label));
	};

	return (
		<div className="flex min-w-[220px] flex-wrap items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2 py-1">
			{value.map((label) => (
				<Badge
					key={label}
					variant="outline"
					className="h-6 gap-1 rounded-full bg-background px-2 text-xs"
				>
					<span className="max-w-24 truncate">{label}</span>
					<button
						type="button"
						disabled={disabled}
						aria-label={`Remove ${label}`}
						className="rounded-full text-muted-foreground hover:text-foreground"
						onClick={() => removeLabel(label)}
					>
						<HiXMark className="size-3" />
					</button>
				</Badge>
			))}
			<Input
				value={input}
				disabled={disabled}
				placeholder={value.length === 0 ? "Add label" : ""}
				className="h-6 min-w-20 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
				onChange={(event) => setInput(event.target.value)}
				onBlur={() => addLabel(input)}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === ",") {
						event.preventDefault();
						addLabel(input);
					}
					if (event.key === "Backspace" && !input && value.length > 0) {
						onChange(value.slice(0, -1));
					}
				}}
			/>
		</div>
	);
}
