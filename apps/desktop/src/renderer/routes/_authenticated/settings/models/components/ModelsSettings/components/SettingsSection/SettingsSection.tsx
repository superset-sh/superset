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
				<div>
					<h3 className="flex items-center gap-2 text-base font-semibold">
						{icon}
						{title}
					</h3>
					{description ? (
						<p className="text-sm text-muted-foreground">{description}</p>
					) : null}
				</div>
				{action}
			</div>
			{children}
		</section>
	);
}
