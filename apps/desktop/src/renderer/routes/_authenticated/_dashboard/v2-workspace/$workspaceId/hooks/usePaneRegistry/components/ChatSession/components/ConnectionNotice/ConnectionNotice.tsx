import { Spinner } from "@superset/ui/spinner";
import type { ReactNode } from "react";

export function ConnectionNotice({ children }: { children: ReactNode }) {
	return (
		<output className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 pb-1 font-sans text-foreground/50 text-xs">
			<Spinner className="size-3" />
			<span className="min-w-0 truncate">{children}</span>
		</output>
	);
}
