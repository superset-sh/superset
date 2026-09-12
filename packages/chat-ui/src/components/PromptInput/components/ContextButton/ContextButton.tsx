"use client";

import { useLingui } from "@lingui/react/macro";
import { PlusIcon } from "lucide-react";

export type ContextButtonProps = {
	onClick: () => void;
	disabled?: boolean;
};

// Click-equivalent of typing "@": opens the mention menu in browse mode.
export function ContextButton({ onClick, disabled }: ContextButtonProps) {
	const { t } = useLingui();
	return (
		<button
			type="button"
			aria-label={t({
				message: "Add files, apps, and more",
			})}
			title={t({
				message: "Add files, apps, and more (@)",
			})}
			disabled={disabled}
			onClick={onClick}
			className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
		>
			<PlusIcon className="size-4.5" />
		</button>
	);
}
