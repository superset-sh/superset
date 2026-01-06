"use client";

import { Suspense } from "react";

import { DesktopAuthSuccess } from "./components/DesktopAuthSuccess";
import { LoadingFallback } from "./components/LoadingFallback";

export default function Page() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
			<Suspense fallback={<LoadingFallback />}>
				<DesktopAuthSuccess />
			</Suspense>
		</div>
	);
}
