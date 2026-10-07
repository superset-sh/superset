import { Trans } from "@lingui/react/macro";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import type { About } from "@/lib/about";

interface InvestorsProps {
	investors: About["investors"];
}

export function Investors({ investors }: InvestorsProps) {
	const featured = investors.filter((investor) => investor.featured);
	const others = investors.filter((investor) => !investor.featured);

	return (
		<div>
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				{featured.map((investor) => (
					<a
						key={investor.name}
						href={investor.href}
						target="_blank"
						rel="noopener noreferrer"
						className="group flex flex-col justify-between gap-10 border border-border p-6 hover:bg-muted/50 hover:border-foreground/20 transition-colors"
					>
						<div className="flex items-start justify-between">
							{investor.logo && (
								<Image
									src={investor.logo}
									alt=""
									width={40}
									height={40}
									className="size-10 rounded-md"
								/>
							)}
							<ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
						</div>
						<div>
							<p className="text-lg text-foreground">{investor.name}</p>
							{investor.detail && (
								<p className="text-sm text-muted-foreground mt-1">
									{investor.detail}
								</p>
							)}
						</div>
					</a>
				))}
			</div>

			<ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-6 mt-10">
				{others.map((investor) => (
					<li key={investor.name} className="flex items-center gap-3">
						{investor.logo && (
							<Image
								src={investor.logo}
								alt=""
								width={28}
								height={28}
								className="size-7 shrink-0 rounded-md"
							/>
						)}
						<div className="min-w-0">
							<p className="text-sm text-foreground">{investor.name}</p>
							{investor.detail && (
								<p className="text-sm text-muted-foreground">
									{investor.detail}
								</p>
							)}
						</div>
					</li>
				))}
			</ul>
			<p className="mt-8 text-right text-sm text-muted-foreground">
				<Trans>...and many more!</Trans>
			</p>
		</div>
	);
}
