import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import type { IconType } from "react-icons";

interface EmptyTabActionButtonProps {
	label: string;
	display: string[];
	icon: IconType;
	onClick: () => void;
}

export function EmptyTabActionButton({
	label,
	display,
	icon: Icon,
	onClick,
}: EmptyTabActionButtonProps) {
	return (
		<Button
			type="button"
			variant="ghost"
			className="group h-9 w-full justify-between rounded-[6px] px-3 text-sm text-muted-foreground/80 transition-colors hover:bg-tertiary/60 hover:text-foreground"
			onClick={onClick}
		>
			<span className="flex items-center gap-2">
				<span className="rounded p-1 text-muted-foreground/90 transition-colors group-hover:text-foreground">
					<Icon className="size-4" />
				</span>
				<span>{label}</span>
			</span>
			<KbdGroup className="ml-2 shrink-0">
				{display.map((key) => (
					<Kbd
						key={`${label}-${key}`}
						className="transition-colors group-hover:bg-accent/80 group-hover:text-foreground"
					>
						{key}
					</Kbd>
				))}
			</KbdGroup>
		</Button>
	);
}
