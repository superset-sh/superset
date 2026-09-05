"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@superset/ui/sheet";
import { cn } from "@superset/ui/utils";
import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { SidebarBody } from "./components/SidebarBody";
import { Wordmark } from "./components/Wordmark";

const SIDEBAR_SURFACE = "border-border bg-sidebar dark:bg-muted/35";

export function AppSidebar() {
	const { t } = useLingui();
	const [sheetOpen, setSheetOpen] = useState(false);

	return (
		<>
			<header
				className={cn(
					"flex h-12 shrink-0 items-center gap-1 border-b px-2 md:hidden",
					SIDEBAR_SURFACE,
				)}
			>
				<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
					<SheetTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={t({ message: "Open navigation" })}
						>
							<Menu className="size-4" />
						</Button>
					</SheetTrigger>
					<SheetContent side="left" className="w-64 gap-0 border-border p-0">
						<SheetTitle className="sr-only">
							<Trans>Navigation</Trans>
						</SheetTitle>
						{/* The translucent sidebar tint needs the opaque sheet under it. */}
						<div className={cn("h-full", SIDEBAR_SURFACE)}>
							<SidebarBody onNavigate={() => setSheetOpen(false)} />
						</div>
					</SheetContent>
				</Sheet>
				<Link
					href="/"
					aria-label={t({ message: "Go to home" })}
					className="px-2"
				>
					<Wordmark />
				</Link>
			</header>
			<aside
				className={cn(
					"hidden h-full w-56 shrink-0 border-r md:block",
					SIDEBAR_SURFACE,
				)}
			>
				<SidebarBody />
			</aside>
		</>
	);
}
