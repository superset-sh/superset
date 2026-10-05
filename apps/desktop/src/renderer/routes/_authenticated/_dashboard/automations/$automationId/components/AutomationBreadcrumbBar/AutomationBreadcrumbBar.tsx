import { Trans } from "@lingui/react/macro";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@superset/ui/breadcrumb";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";

interface AutomationBreadcrumbBarProps {
	/** Omitted when the automation could not be loaded — the crumb stops at the list. */
	name?: string;
	/** The header's right-hand actions, if there are any. */
	children?: ReactNode;
}

/**
 * The detail route's top bar. Error states render it without a name so a
 * deep link that lands somewhere unusable still offers the way back.
 */
export function AutomationBreadcrumbBar({
	name,
	children,
}: AutomationBreadcrumbBarProps) {
	return (
		<PageHeader
			className="shadow-[inset_0_-1px_0_var(--border)]"
			start={
				<Breadcrumb>
					<BreadcrumbList className="text-sm">
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link to="/automations">
									<Trans>Automations</Trans>
								</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
						{name !== undefined && (
							<>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage className="font-medium">
										{name}
									</BreadcrumbPage>
								</BreadcrumbItem>
							</>
						)}
					</BreadcrumbList>
				</Breadcrumb>
			}
			end={
				children && <div className="flex items-center gap-1">{children}</div>
			}
		/>
	);
}
