"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarInput,
} from "@superset/ui/sidebar";
import { LuSearch } from "react-icons/lu";

export function SearchForm({ ...props }: React.ComponentProps<"form">) {
	const { t } = useLingui();

	return (
		<form {...props}>
			<SidebarGroup className="py-0">
				<SidebarGroupContent className="relative">
					<Label htmlFor="search" className="sr-only">
						<Trans>Search</Trans>
					</Label>
					<SidebarInput
						id="search"
						placeholder={t({
							message: "Search...",
						})}
						className="pl-8"
					/>
					<LuSearch className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 opacity-50 select-none" />
				</SidebarGroupContent>
			</SidebarGroup>
		</form>
	);
}
