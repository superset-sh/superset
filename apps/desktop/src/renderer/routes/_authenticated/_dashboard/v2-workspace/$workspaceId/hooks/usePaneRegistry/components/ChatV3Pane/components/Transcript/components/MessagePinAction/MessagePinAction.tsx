import { useLingui } from "@lingui/react/macro";
import { MessageAction } from "@superset/ui/ai-elements/message";
import { Pin } from "lucide-react";

export function MessagePinAction({
	isPinned,
	onToggle,
}: {
	isPinned: boolean;
	onToggle: () => void;
}) {
	const { t } = useLingui();
	const label = isPinned
		? t({ message: "Unpin message" })
		: t({ message: "Pin message" });

	return (
		<MessageAction
			aria-pressed={isPinned}
			className={
				isPinned
					? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
					: "text-muted-foreground hover:text-foreground"
			}
			label={label}
			onClick={onToggle}
			size="icon-xs"
			tooltip={label}
		>
			<Pin
				className="size-3.5"
				fill={isPinned ? "currentColor" : "none"}
				strokeWidth={isPinned ? 2.25 : 2}
			/>
		</MessageAction>
	);
}
