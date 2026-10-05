import type { ComponentProps } from "react";

export function CloudWorkspaceRowChip(props: ComponentProps<"button">) {
	return (
		<button
			type="button"
			className="inline-flex h-5 shrink-0 items-center gap-[5px] rounded-full border border-border px-[7px] text-[11px] whitespace-nowrap text-muted-foreground tabular-nums hover:bg-fill-hover hover:text-foreground"
			{...props}
		/>
	);
}
