"use client";

import { useLingui } from "@lingui/react/macro";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@superset/ui/breadcrumb";
import { usePathname } from "next/navigation";

export function PageBreadcrumb() {
	const { t } = useLingui();
	const pathname = usePathname();
	const current = pathname.startsWith("/growth")
		? t({ message: "Growth" })
		: t({ message: "Home" });

	return (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbItem className="hidden md:block">
					<BreadcrumbLink href="/">Superset</BreadcrumbLink>
				</BreadcrumbItem>
				<BreadcrumbSeparator className="hidden md:block" />
				<BreadcrumbItem>
					<BreadcrumbPage>{current}</BreadcrumbPage>
				</BreadcrumbItem>
			</BreadcrumbList>
		</Breadcrumb>
	);
}
