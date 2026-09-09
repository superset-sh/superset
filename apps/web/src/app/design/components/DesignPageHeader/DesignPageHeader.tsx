import { msg } from "@lingui/core/macro";
import { cn } from "@superset/ui/utils";
import Link from "next/link";
import { i18n } from "@/lib/i18n-server";

const PAGES = [
	{
		key: "primitives",
		href: "/design",
		label: msg({ message: "Primitives" }),
	},
	{
		key: "superset",
		href: "/design/superset",
		label: msg({
			message: "Superset components",
		}),
	},
] as const;

interface DesignPageHeaderProps {
	active: (typeof PAGES)[number]["key"];
	title: string;
	description: React.ReactNode;
}

export function DesignPageHeader({
	active,
	title,
	description,
}: DesignPageHeaderProps) {
	return (
		<header className="border-b border-border">
			<div className="mx-auto max-w-6xl px-6 pt-12">
				<p className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
					{i18n._(
						msg({
							message: "packages/ui · component registry",
						}),
					)}
				</p>
				<h1 className="text-3xl font-medium tracking-tight text-foreground">
					{title}
				</h1>
				<p className="mt-2 max-w-xl text-sm text-muted-foreground">
					{description}
				</p>
				<nav className="mt-8 flex gap-6">
					{PAGES.map((page) => (
						<Link
							key={page.key}
							href={page.href}
							aria-current={active === page.key ? "page" : undefined}
							className={cn(
								"-mb-px border-b-2 pb-3 text-sm transition-colors",
								active === page.key
									? "border-foreground font-medium text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
						>
							{i18n._(page.label)}
						</Link>
					))}
				</nav>
			</div>
		</header>
	);
}
