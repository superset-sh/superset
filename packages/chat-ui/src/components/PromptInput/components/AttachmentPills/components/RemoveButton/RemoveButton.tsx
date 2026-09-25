"use client";

import { useLingui } from "@lingui/react/macro";
import { XIcon } from "lucide-react";

export type RemoveButtonProps = {
	onClick: () => void;
};

export function RemoveButton({ onClick }: RemoveButtonProps) {
	const { t } = useLingui();
	return (
		<button
			type="button"
			aria-label={t({
				message: "Remove attachment",
			})}
			className="absolute top-1 right-1 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
			onClick={onClick}
		>
			<XIcon className="size-3" />
		</button>
	);
}
