import { Button } from "@superset/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { WorkspaceList } from "./components/WorkspaceList";

export default function CloudPage() {
	return (
		<div className="space-y-8">
			<section>
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-xl font-semibold">Cloud Workspaces</h2>
						<p className="text-muted-foreground">
							Manage your cloud workspaces here.
						</p>
					</div>
					<Button asChild>
						<Link href="/cloud/new">
							<Plus className="mr-2 size-4" />
							Create Workspace
						</Link>
					</Button>
				</div>

				<div className="mt-6">
					<WorkspaceList />
				</div>
			</section>
		</div>
	);
}
