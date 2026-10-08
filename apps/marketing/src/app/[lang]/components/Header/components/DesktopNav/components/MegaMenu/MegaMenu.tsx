import { NavigationMenuLink } from "@superset/ui/navigation-menu";
import Image from "next/image";
import Link from "next/link";
import { LuArrowRight } from "react-icons/lu";
import type { NavFeatured, NavLink, NavSection } from "../../../../constants";

interface MegaMenuProps {
	sections: NavSection[];
	featured: NavFeatured;
}

export function MegaMenu({ sections, featured }: MegaMenuProps) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_16rem] gap-8 p-8">
			<div className="divide-y divide-border">
				{sections.map((section) => (
					<section key={section.id} className="py-5 first:pt-0 last:pb-0">
						<h3 className="mb-3 px-3 font-mono text-brand text-xs uppercase tracking-wider">
							{section.title}
						</h3>
						<ul className="grid grid-cols-4 gap-1">
							{section.links.map((link) => (
								<MegaMenuItem key={link.href} link={link} />
							))}
						</ul>
					</section>
				))}
			</div>
			<NavigationMenuLink asChild className="p-0 hover:bg-transparent">
				<Link
					href={featured.href}
					className="group relative flex min-h-72 flex-col justify-between overflow-hidden border border-border p-5"
				>
					<Image
						src={featured.image}
						alt=""
						fill
						sizes="16rem"
						className="object-cover object-left-top opacity-40 transition-opacity duration-300 group-hover:opacity-55"
					/>
					<div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
					<div className="relative">
						<p className="font-mono text-brand text-xs uppercase tracking-wider">
							{featured.eyebrow}
						</p>
						<p className="mt-2 font-medium text-2xl text-foreground tracking-tight">
							{featured.title}
						</p>
					</div>
					<div className="relative">
						<p className="text-muted-foreground text-sm leading-relaxed">
							{featured.description}
						</p>
						<p className="mt-4 flex items-center gap-1.5 text-foreground text-sm">
							{featured.cta}
							<LuArrowRight
								aria-hidden="true"
								className="size-3.5 transition-transform group-hover:translate-x-0.5"
							/>
						</p>
					</div>
				</Link>
			</NavigationMenuLink>
		</div>
	);
}

function MegaMenuItem({ link }: { link: NavLink }) {
	return (
		<li>
			<NavigationMenuLink asChild className="gap-1 rounded-sm p-3">
				<Link
					href={link.href}
					{...(link.external && {
						target: "_blank",
						rel: "noopener noreferrer",
					})}
				>
					<span className="flex items-center gap-2 font-medium text-foreground text-sm">
						{link.label}
						{link.badge && (
							<span className="border border-border px-1.5 py-px font-mono font-normal text-[10px] text-muted-foreground uppercase tracking-wider">
								{link.badge}
							</span>
						)}
					</span>
					{link.description && (
						<span className="text-muted-foreground text-xs leading-snug">
							{link.description}
						</span>
					)}
				</Link>
			</NavigationMenuLink>
		</li>
	);
}
