import { HiOutlineDocumentMagnifyingGlass } from "react-icons/hi2";

interface EmptyStateProps {
	title: string;
	description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
	return (
		<div className="flex-1 flex flex-col items-center justify-center text-muted-foreground px-4 h-full">
			<HiOutlineDocumentMagnifyingGlass className="w-12 h-12 mb-4 opacity-50" />
			<h3 className="text-lg font-medium mb-1">{title}</h3>
			{description && (
				<p className="text-sm text-center max-w-sm">{description}</p>
			)}
		</div>
	);
}
