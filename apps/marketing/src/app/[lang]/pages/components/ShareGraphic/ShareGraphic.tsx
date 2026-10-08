import { Trans } from "@lingui/react/macro";
import { Building2, Check, Globe, Link2, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { StepFrame } from "../StepFrame";

export function ShareGraphic() {
	return (
		<StepFrame>
			<div className="w-full max-w-xs overflow-hidden rounded-md border border-border bg-popover text-sm shadow-lg">
				<div className="flex items-center justify-between px-3 py-2.5">
					<span className="font-medium">
						<Trans>Share page</Trans>
					</span>
					<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
						<Link2 className="size-3.5" />
						<Trans>Copy link</Trans>
					</span>
				</div>
				<div className="border-border border-t px-3 py-2.5">
					<p className="mb-2 font-medium text-xs">
						<Trans>People with access</Trans>
					</p>
					<ShareOption icon={<Lock className="size-3.5" />}>
						<Trans>Only you</Trans>
					</ShareOption>
					<ShareOption icon={<Building2 className="size-3.5" />} selected>
						<Trans>Anyone in your organization</Trans>
					</ShareOption>
					<ShareOption icon={<Globe className="size-3.5" />}>
						<Trans>Anyone with the link</Trans>
					</ShareOption>
				</div>
			</div>
		</StepFrame>
	);
}

function ShareOption({
	icon,
	selected = false,
	children,
}: {
	icon: ReactNode;
	selected?: boolean;
	children: ReactNode;
}) {
	return (
		<div
			className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs ${selected ? "bg-accent text-foreground" : "text-muted-foreground"}`}
		>
			{icon}
			<span className="flex-1">{children}</span>
			{selected && <Check className="size-3.5" />}
		</div>
	);
}
