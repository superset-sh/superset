import { Trans } from "@lingui/react/macro";
import { Pixel404 } from "@superset/ui/pixel-404";
import { Link } from "@tanstack/react-router";
import { FailureLayout } from "renderer/components/FailureLayout";

export function NotFound() {
	return (
		<FailureLayout>
			<div className="flex min-h-full items-center justify-center">
				<div className="flex flex-col items-center w-full max-w-md px-8">
					<div className="flex flex-col items-center text-center">
						<Pixel404 className="max-w-[260px] text-foreground mb-6" />
						<h2 className="text-xl font-semibold text-foreground mb-2">
							<Trans>Page Not Found</Trans>
						</h2>
						<p className="text-sm text-muted-foreground mb-8">
							<Trans>The page you're looking for doesn't exist.</Trans>
						</p>
						<Link
							to="/"
							className="text-sm text-primary hover:text-primary/80 underline transition-colors"
						>
							<Trans>Go back home</Trans>
						</Link>
					</div>
				</div>
			</div>
		</FailureLayout>
	);
}
