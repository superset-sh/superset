import { env } from "@/env";

export function Footer() {
	return (
		<footer className="mt-auto w-full border-t border-border/50 py-5">
			<div className="mx-auto flex w-[95vw] max-w-screen-2xl items-center justify-between">
				<p className="text-sm text-muted-foreground">© 2025 Superset</p>
				<div className="flex items-center gap-4">
					<a
						href={`${env.NEXT_PUBLIC_MARKETING_URL}/terms`}
						target="_blank"
						rel="noopener noreferrer"
						className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
					>
						Terms of Service
					</a>
					<span className="text-xs text-muted-foreground/70" aria-hidden="true">
						|
					</span>
					<a
						href={`${env.NEXT_PUBLIC_MARKETING_URL}/privacy`}
						target="_blank"
						rel="noopener noreferrer"
						className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
					>
						Privacy Policy
					</a>
				</div>
			</div>
		</footer>
	);
}
