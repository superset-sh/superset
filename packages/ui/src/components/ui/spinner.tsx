import { msg } from "@lingui/core/macro";
import { Loader2Icon } from "lucide-react";
import { i18n } from "../../lib/i18n";
import { cn } from "../../lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
	return (
		<Loader2Icon
			role="status"
			aria-label={i18n._(msg({ message: "Loading" }))}
			className={cn("size-4 animate-spin", className)}
			{...props}
		/>
	);
}

export { Spinner };
