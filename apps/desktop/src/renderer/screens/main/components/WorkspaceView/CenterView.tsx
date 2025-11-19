import type { ReactNode } from "react";

interface CenterViewProps {
	children?: ReactNode;
}

export function CenterView({ children }: CenterViewProps) {
	return (
		<main className="flex-1 h-full overflow-auto bg-background">
			<div className="h-full w-full p-6">
				{children || (
					<div className="flex items-center justify-center h-full">
						<div className="text-center">
							<h2 className="text-2xl font-semibold text-foreground mb-2">
								Welcome to Superset
							</h2>
							<p className="text-muted-foreground">
								Your content will appear here
							</p>
						</div>
					</div>
				)}
			</div>
		</main>
	);
}
