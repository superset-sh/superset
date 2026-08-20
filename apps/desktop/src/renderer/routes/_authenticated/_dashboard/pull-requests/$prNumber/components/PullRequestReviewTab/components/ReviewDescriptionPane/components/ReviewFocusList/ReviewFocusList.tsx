import { cn } from "@superset/ui/utils";
import { LuCircleAlert } from "react-icons/lu";
import { REVIEW_FOCUS_ALERT_CLASSNAME } from "../../../../../../utils/reviewTagStyles";

interface ReviewFocusListProps {
	items: string[];
}

export function ReviewFocusList({ items }: ReviewFocusListProps) {
	if (items.length === 0) return null;

	return (
		<ul className="flex list-none flex-col gap-2">
			{items.map((item) => (
				<li key={item} className="flex items-start gap-2">
					<span
						className={cn(
							"flex size-4 shrink-0 items-center justify-center rounded-full",
							REVIEW_FOCUS_ALERT_CLASSNAME,
						)}
					>
						<LuCircleAlert className="size-3.5" />
					</span>
					<span className="text-[13px] leading-relaxed text-foreground">
						{item}
					</span>
				</li>
			))}
		</ul>
	);
}
