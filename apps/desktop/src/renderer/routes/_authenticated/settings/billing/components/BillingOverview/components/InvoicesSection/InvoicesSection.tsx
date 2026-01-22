import { Card, CardContent } from "@superset/ui/card";

export function InvoicesSection() {
	return (
		<div className="space-y-3">
			<h3 className="text-sm font-medium">Recent invoices</h3>
			<Card className="gap-0 rounded-lg border-border/60 py-0 shadow-none">
				<CardContent className="px-5 py-4">
					<p className="text-xs text-muted-foreground">No invoices yet</p>
				</CardContent>
			</Card>
		</div>
	);
}
