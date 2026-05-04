import type { ReactNode } from "react";

interface SettingsSectionProps {
	title: string;
	icon?: ReactNode;
	description?: string;
	action?: ReactNode;
	children: ReactNode;
}

export function SettingsSection({
	title,
	icon,
	description,
	action,
	children,
}: SettingsSectionProps) {
	return (
		<section className="space-y-3">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<h3 className="flex items-center gap-2 text-sm font-medium">
						{icon}
						{title}
					</h3>
					{description ? (
						<p className="text-xs text-muted-foreground mt-0.5">
							{description}
						</p>
					) : null}
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</div>
			{children}
		</section>
	);
}
