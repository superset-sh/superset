import { useLingui } from "@lingui/react/macro";
import { Input } from "@superset/ui/input";
import { cn } from "@superset/ui/utils";
import { Pencil } from "lucide-react";
import { FOCUS_RING } from "../../constants";

const MASKED_SECRET = "••••••••";

export function SavedSecret({
	label,
	onReplace,
}: {
	label: string;
	onReplace: () => void;
}) {
	const { t } = useLingui();
	return (
		<div className="relative">
			<Input
				aria-label={label}
				className="pr-9 font-mono text-sm"
				readOnly
				value={MASKED_SECRET}
			/>
			<button
				aria-label={t({ message: "Replace" })}
				className={cn(
					"absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground",
					FOCUS_RING,
				)}
				onClick={onReplace}
				type="button"
			>
				<Pencil className="size-4" />
			</button>
		</div>
	);
}
