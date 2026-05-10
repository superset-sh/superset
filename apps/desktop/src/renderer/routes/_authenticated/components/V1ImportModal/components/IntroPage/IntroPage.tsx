export function IntroPage() {
	return (
		<div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-background px-14 py-8 text-center">
			<div className="text-2xl font-semibold text-foreground">
				Let's get you started
			</div>
			<p className="mt-3 max-w-md text-sm text-muted-foreground">
				Let's get your workspaces and projects ported over. Terminal sessions
				won't be carried over, but you can still access v1 at any time.
			</p>
		</div>
	);
}
