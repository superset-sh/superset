import type { Metadata } from "next";
import Link from "next/link";

import { NotFoundGrid } from "./components/NotFoundGrid";
import { Pixel404 } from "./components/Pixel404";

export const metadata: Metadata = {
	title: "Page Not Found",
	robots: { index: false },
};

export default function NotFound() {
	return (
		<main className="relative bg-background min-h-[calc(100vh-3.5rem)] flex items-center overflow-hidden">
			<NotFoundGrid />

			<div className="relative z-10 w-full max-w-6xl mx-auto px-6 sm:px-8 lg:px-12 flex flex-col lg:flex-row items-center gap-12 lg:gap-20 py-24">
				<div className="flex-1 flex items-center justify-center">
					<Pixel404 />
				</div>

				<div className="flex-1 max-w-md space-y-6">
					<h1 className="text-3xl sm:text-4xl font-medium text-foreground">
						Page not found
					</h1>
					<p className="text-sm sm:text-base font-light text-muted-foreground leading-relaxed">
						The page you&apos;re looking for doesn&apos;t exist or has been
						moved.
					</p>
					<Link
						href="/"
						className="inline-flex items-center gap-2 mt-2 px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-normal border border-border text-foreground hover:bg-muted transition-colors"
					>
						Take me home
					</Link>
				</div>
			</div>
		</main>
	);
}
