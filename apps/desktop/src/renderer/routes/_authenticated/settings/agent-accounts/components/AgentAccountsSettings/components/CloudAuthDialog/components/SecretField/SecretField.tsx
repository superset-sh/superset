import { useLingui } from "@lingui/react/macro";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { cn } from "@superset/ui/utils";
import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import { FOCUS_RING } from "../../constants";

export function SecretField({
	placeholder,
	label,
	hideLabel,
	className,
	value,
	onChange,
}: {
	placeholder: string;
	label: string;
	hideLabel?: boolean;
	className?: string;
	value?: string;
	onChange?: (value: string) => void;
}) {
	const { t } = useLingui();
	const id = useId();
	const [shown, setShown] = useState(false);
	return (
		<div className={cn("space-y-1.5", className)}>
			{hideLabel ? null : <Label htmlFor={id}>{label}</Label>}
			<div className="relative">
				<Input
					aria-label={hideLabel ? label : undefined}
					autoComplete="off"
					className="pr-9 font-mono text-sm"
					id={id}
					onChange={(e) => onChange?.(e.target.value)}
					placeholder={placeholder}
					type={shown ? "text" : "password"}
					value={value}
				/>
				<button
					aria-label={shown ? t({ message: "Hide" }) : t({ message: "Show" })}
					className={cn(
						"absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground",
						FOCUS_RING,
					)}
					onClick={() => setShown((value) => !value)}
					type="button"
				>
					{shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
				</button>
			</div>
		</div>
	);
}
