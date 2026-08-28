import type { Metadata } from "next";
import { Suspense } from "react";
import { PrViewer } from "./components/PrViewer";

export const metadata: Metadata = {
	title: "View a pull request",
};

export default function PrPage() {
	return (
		<Suspense fallback={null}>
			<PrViewer />
		</Suspense>
	);
}
