import { auth } from "@clerk/nextjs/server";
import Image from "next/image";
import { redirect } from "next/navigation";

import { env } from "@/env";

export default async function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { userId } = await auth();

	// Redirect authenticated users to home
	if (userId) {
		redirect("/");
	}

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
