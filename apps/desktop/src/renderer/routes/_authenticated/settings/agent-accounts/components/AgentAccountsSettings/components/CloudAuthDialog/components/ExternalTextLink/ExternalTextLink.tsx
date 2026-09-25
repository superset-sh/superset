import { cn } from "@superset/ui/utils";
import { ArrowUpRight } from "lucide-react";
import { FOCUS_RING } from "../../constants";

export function ExternalTextLink({
	href,
	underline,
	children,
}: {
	href: string;
	underline?: boolean;
	children: React.ReactNode;
}) {
	return (
		<a
			className={cn(
				"inline-flex items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground",
				underline && "underline underline-offset-4",
				FOCUS_RING,
			)}
			href={href}
			rel="noreferrer"
			target="_blank"
		>
			{children}
			<ArrowUpRight className="size-3.5" />
		</a>
	);
}
