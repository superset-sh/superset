"use client";

import { Trans } from "@lingui/react/macro";
import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
	navigationMenuTriggerStyle,
} from "@superset/ui/navigation-menu";
import { cn } from "@superset/ui/utils";
import Link from "next/link";
import { useState } from "react";
import {
	PRODUCT_FEATURED,
	PRODUCT_SECTIONS,
	RESOURCE_FEATURED,
	RESOURCE_SECTIONS,
	TOP_LEVEL_LINKS,
} from "../../constants";
import { MegaMenu } from "./components/MegaMenu";

const triggerClass = cn(
	navigationMenuTriggerStyle(),
	"h-8 rounded-none bg-transparent px-4 text-[13px] tracking-[0.01em] font-normal text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground focus:bg-transparent focus:text-foreground data-[state=open]:bg-transparent data-[state=open]:text-foreground",
);

const MEGA_MENU_PANEL_CLASS =
	"md:fixed md:top-[calc(4rem-0.25rem)] md:left-[max(1rem,calc(50%-32rem))] md:w-[min(64rem,calc(100vw-2rem))] md:max-h-[calc(100dvh-5rem)] md:overflow-y-auto";

export function DesktopNav() {
	// Radix's NavigationMenu is uncontrolled by default, so a hover-opened
	// trigger and a click on that same trigger both race to set its shared
	// internal `value`. A click toggles, so clicking a menu that hover just
	// opened immediately closes it again. Controlling `value` ourselves lets
	// us make click idempotent (open-only) instead of toggling, so it can
	// never fight with the hover-intent timers.
	const [openMenu, setOpenMenu] = useState("");

	const ignoreCloseClick = (menu: string) => (event: React.MouseEvent) => {
		if (openMenu === menu) event.preventDefault();
	};

	return (
		<NavigationMenu
			value={openMenu}
			onValueChange={setOpenMenu}
			viewport={false}
		>
			<NavigationMenuList>
				<NavigationMenuItem value="product">
					<NavigationMenuTrigger
						className={triggerClass}
						onClick={ignoreCloseClick("product")}
					>
						<Trans>Product</Trans>
					</NavigationMenuTrigger>
					<NavigationMenuContent className={MEGA_MENU_PANEL_CLASS}>
						<MegaMenu sections={PRODUCT_SECTIONS} featured={PRODUCT_FEATURED} />
					</NavigationMenuContent>
				</NavigationMenuItem>

				<NavigationMenuItem value="resources">
					<NavigationMenuTrigger
						className={triggerClass}
						onClick={ignoreCloseClick("resources")}
					>
						<Trans>Resources</Trans>
					</NavigationMenuTrigger>
					<NavigationMenuContent className={MEGA_MENU_PANEL_CLASS}>
						<MegaMenu
							sections={RESOURCE_SECTIONS}
							featured={RESOURCE_FEATURED}
						/>
					</NavigationMenuContent>
				</NavigationMenuItem>

				{TOP_LEVEL_LINKS.map((link) => (
					<NavigationMenuItem key={link.href}>
						<NavigationMenuLink asChild className={triggerClass}>
							<Link href={link.href}>{link.label}</Link>
						</NavigationMenuLink>
					</NavigationMenuItem>
				))}
			</NavigationMenuList>
		</NavigationMenu>
	);
}
