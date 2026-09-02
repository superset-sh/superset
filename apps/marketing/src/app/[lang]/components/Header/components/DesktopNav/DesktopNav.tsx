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
	type NavLink,
	PRODUCT_LINKS,
	RESOURCE_LINKS,
	TOP_LEVEL_LINKS,
} from "../../constants";

const triggerClass = cn(
	navigationMenuTriggerStyle(),
	"h-8 rounded-none bg-transparent px-4 text-[13px] tracking-[0.01em] font-normal text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground focus:bg-transparent focus:text-foreground data-[state=open]:bg-transparent data-[state=open]:text-foreground",
);

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
		<NavigationMenu value={openMenu} onValueChange={setOpenMenu}>
			<NavigationMenuList>
				<NavigationMenuItem value="product">
					<NavigationMenuTrigger
						className={triggerClass}
						onClick={ignoreCloseClick("product")}
					>
						<Trans>Product</Trans>
					</NavigationMenuTrigger>
					<NavigationMenuContent>
						<ul className="flex w-[320px] flex-col gap-1 p-2">
							{PRODUCT_LINKS.map((link) => (
								<NavListItem key={link.href} link={link} />
							))}
						</ul>
					</NavigationMenuContent>
				</NavigationMenuItem>

				<NavigationMenuItem value="resources">
					<NavigationMenuTrigger
						className={triggerClass}
						onClick={ignoreCloseClick("resources")}
					>
						<Trans>Resources</Trans>
					</NavigationMenuTrigger>
					<NavigationMenuContent>
						<ul className="grid w-[400px] grid-cols-1 gap-1 p-2 sm:w-[460px] sm:grid-cols-2">
							{RESOURCE_LINKS.map((link) => (
								<NavListItem key={link.href} link={link} />
							))}
						</ul>
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

function NavListItem({ link }: { link: NavLink }) {
	const content = (
		<>
			<div className="flex items-center gap-2 text-sm font-medium text-foreground">
				{link.label}
			</div>
			{link.description && (
				<p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
					{link.description}
				</p>
			)}
		</>
	);

	return (
		<li>
			<NavigationMenuLink asChild className="gap-1 rounded-sm p-3">
				{link.external ? (
					<a href={link.href} target="_blank" rel="noopener noreferrer">
						{content}
					</a>
				) : (
					<Link href={link.href}>{content}</Link>
				)}
			</NavigationMenuLink>
		</li>
	);
}
