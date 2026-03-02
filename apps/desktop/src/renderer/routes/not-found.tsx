import { Link } from "@tanstack/react-router";

export function NotFound() {
	return (
		<div className="flex flex-col h-full w-full bg-background">
			<div className="h-12 w-full drag shrink-0" />

			<div className="flex flex-1 items-center justify-center">
				<div className="flex flex-col items-center w-full max-w-md px-8">
					<div className="text-center">
						<h1 className="text-6xl font-bold text-foreground mb-4">404</h1>
						<h2 className="text-xl font-semibold text-foreground mb-2">
							Page Not Found
						</h2>
						<p className="text-sm text-muted-foreground mb-8">
							The page you're looking for doesn't exist.
						</p>
						<Link
							to="/"
							className="text-sm text-primary hover:text-primary/80 underline transition-colors"
						>
							Go back home
						</Link>
					</div>
				</div>
			</div>
		</div>
	);
}
