import { Plus } from "lucide-react";
import type { ReactNode } from "react";

export function MenuGroup({
	title,
	actions,
	addLabel,
	onAdd,
	children,
}: {
	title: ReactNode;
	actions?: ReactNode;
	addLabel?: string;
	onAdd?: () => void;
	children: ReactNode;
}) {
	return (
		<section className="py-1">
			<div className="flex h-7 items-center justify-between pl-2 pr-1">
				<span className="text-[11px] font-medium text-muted-foreground">
					{title}
				</span>
				<span className="flex items-center gap-0.5">
					{actions}
					{onAdd && (
						<button
							type="button"
							aria-label={addLabel}
							title={addLabel}
							onClick={onAdd}
							className="flex size-6 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent"
						>
							<Plus className="size-3.5" />
						</button>
					)}
				</span>
			</div>
			{children}
		</section>
	);
}
