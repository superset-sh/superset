import { cn } from "@/lib/cn";
import { ResourceCard } from "../ResourceCard";

interface ResourceGridProps {
	resources: {
		title: string;
		description: string;
		href: string;
		tags?: string[];
	}[];
	className?: string;
}

export function ResourceGrid({ resources, className }: ResourceGridProps) {
	return (
		<div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
			{resources.map((resource, index) => (
				<ResourceCard key={`${resource.href}-${index}`} {...resource} />
			))}
		</div>
	);
}
