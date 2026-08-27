import { Input } from "@superset/ui/input";

import { ComponentCard } from "../../../components/ComponentCard";
import { ShowcaseSection } from "../../../components/ShowcaseSection";

export function InputAuditSection() {
	return (
		<ShowcaseSection
			id="input-audit"
			index="03"
			title="Input — one recurring override"
			description="54 files, 84 occurrences. Mostly clean; one repeated full-chrome strip."
		>
			<ComponentCard
				title="1 · Canonical, correct"
				importPath="RenameBranchDialog.tsx"
				copyable={false}
				description="Default variant, no className."
			>
				<Input placeholder="Branch name" className="max-w-56" />
			</ComponentCard>

			<ComponentCard
				title="2 · Borderless inline override"
				importPath="PromptGroup.tsx (repeated with slight variation twice)"
				copyable={false}
				description="Strips the component's chrome entirely via className. Input already has variant=&quot;ghost&quot; — close, but doesn't match (padding/height differ) — worth comparing directly."
			>
				<Input
					placeholder="Workspace name (optional)"
					className="h-auto min-w-0 flex-1 border-none bg-transparent px-0 text-base font-medium shadow-none placeholder:text-muted-foreground/40 focus-visible:ring-0"
				/>
			</ComponentCard>
		</ShowcaseSection>
	);
}
