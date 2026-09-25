import { Label } from "@superset/ui/label";
import type { ReactNode } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { HighlightText } from "../HighlightText";

interface SettingsRowProps {
	label: string;
	hint?: ReactNode;
	htmlFor?: string;
	children: ReactNode;
}

export function SettingsRow({
	label,
	hint,
	htmlFor,
	children,
}: SettingsRowProps) {
	const searchQuery = useSettingsSearchQuery();

	return (
		<div className="flex items-center justify-between gap-8 py-2.5">
			<div className="min-w-0 flex-1">
				<Label htmlFor={htmlFor} className="text-sm font-medium">
					<HighlightText text={label} query={searchQuery} />
				</Label>
				{hint && (
					<p className="mt-0.5 text-xs text-muted-foreground">
						{typeof hint === "string" ? (
							<HighlightText text={hint} query={searchQuery} />
						) : (
							hint
						)}
					</p>
				)}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}
