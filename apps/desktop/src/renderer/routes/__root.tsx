import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import { ThemedToaster } from "renderer/components/ThemedToaster";
import { PostHogUserIdentifier } from "renderer/components/PostHogUserIdentifier";
import { AuthProvider } from "renderer/contexts/AuthProvider";
import { MonacoProvider } from "renderer/contexts/MonacoProvider";
import { PostHogProvider } from "renderer/contexts/PostHogProvider";
import { TRPCProvider } from "renderer/contexts/TRPCProvider";

export const Route = createRootRoute({
	component: RootComponent,
	notFoundComponent: NotFoundComponent,
});

function RootComponent() {
	return (
		<PostHogProvider>
			<TRPCProvider>
				<PostHogUserIdentifier />
				<AuthProvider>
					<MonacoProvider>
						<Outlet />
						<ThemedToaster />
					</MonacoProvider>
				</AuthProvider>
			</TRPCProvider>
		</PostHogProvider>
	);
}

function NotFoundComponent() {
	return (
		<div style={{ padding: "2rem", textAlign: "center" }}>
			<h1>404 - Page Not Found</h1>
			<p>The page you're looking for doesn't exist.</p>
			<Link to="/" style={{ color: "#3b82f6", textDecoration: "underline" }}>
				Go back home
			</Link>
		</div>
	);
}
