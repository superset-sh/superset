import { Badge } from "@superset/ui/badge";

export interface SharedComponent {
	name: string;
	path: string;
	sites?: number;
	note: string;
}

export function SharedComponentList({ items }: { items: SharedComponent[] }) {
	return (
		<div className="w-full space-y-1.5">
			{items.map((component) => (
				<div
					key={component.path}
					className="flex flex-col gap-1 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
				>
					<div className="flex w-56 shrink-0 items-center gap-2">
						<code className="font-mono text-xs text-foreground">
							{component.name}
						</code>
						{component.sites && <Badge variant="box">{component.sites}×</Badge>}
					</div>
					<span className="flex-1 text-xs text-muted-foreground">
						{component.note}
					</span>
					<code className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
						{component.path}
					</code>
				</div>
			))}
		</div>
	);
}
