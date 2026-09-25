import Image from "next/image";
import type { ReactNode } from "react";
import { env } from "@/env";

export function MessageScreen({
	graphic,
	title,
	description,
	action,
}: {
	graphic?: ReactNode;
	title: string;
	description: ReactNode;
	action?: ReactNode;
}) {
	return (
		<div className="relative flex min-h-dvh flex-col bg-background">
			<header className="container mx-auto px-6 py-6">
				<a href={env.NEXT_PUBLIC_MARKETING_URL}>
					<Image
						src="/title.svg"
						alt="Superset"
						width={140}
						height={24}
						priority
					/>
				</a>
			</header>
			<main className="flex flex-1 items-center justify-center px-6 pb-24">
				<div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
					{graphic ? <div className="pb-3">{graphic}</div> : null}
					<h1 className="font-semibold text-lg tracking-tight">{title}</h1>
					<p className="text-balance text-muted-foreground text-sm">
						{description}
					</p>
					{action ? <div className="pt-2">{action}</div> : null}
				</div>
			</main>
		</div>
	);
}
