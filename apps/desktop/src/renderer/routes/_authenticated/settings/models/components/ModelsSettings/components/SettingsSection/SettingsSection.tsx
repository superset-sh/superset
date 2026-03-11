import type { ReactNode } from "react";

interface SettingsSectionProps {
	title: string;
	description?: string;
	action?: ReactNode;
	children: ReactNode;
}

export function SettingsSection({
	title,
	description,
	action,
	children,
}: SettingsSectionProps) {
	return (
		<section className="space-y-3">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h3 className="text-base font-semibold">{title}</h3>
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
