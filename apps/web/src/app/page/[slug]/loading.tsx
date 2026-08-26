import { Spinner } from "@superset/ui/spinner";

export default function Loading() {
	return (
		<div className="flex h-dvh flex-col bg-background">
			<header className="flex h-11 shrink-0 items-center gap-x-3 border-b px-3">
				<div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
				<div className="ml-auto h-3.5 w-8 animate-pulse rounded bg-muted" />
			</header>
			<main className="flex min-h-0 flex-1 items-center justify-center">
				<Spinner className="size-4 text-muted-foreground" />
			</main>
		</div>
	);
}
