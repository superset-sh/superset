import Image from "next/image";

import { env } from "@/env";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="relative flex min-h-screen flex-col">
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
			<main className="flex flex-1 items-center justify-center">
				{children}
			</main>
		</div>
	);
}
