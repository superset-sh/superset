import { type AnyRouter, RouterProvider } from "@tanstack/react-router";
import { RendererLayout } from "../RendererLayout";

export function RendererRouter({ router }: { router: AnyRouter }) {
	return (
		<RendererLayout>
			<RouterProvider router={router} disableGlobalCatchBoundary />
		</RendererLayout>
	);
}
