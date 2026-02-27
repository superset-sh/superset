import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { GoGitPullRequest } from "react-icons/go";
import { LuLoader } from "react-icons/lu";

interface PrUrlSectionProps {
	prUrl: string;
	onPrUrlChange: (value: string) => void;
	onSubmit: () => void;
	isPending: boolean;
}

export function PrUrlSection({
	prUrl,
	onPrUrlChange,
	onSubmit,
	isPending,
}: PrUrlSectionProps) {
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !isPending) {
			e.preventDefault();
			onSubmit();
		}
	};

	return (
		<div className="space-y-1.5">
			<div className="flex gap-2">
				<div className="relative flex-1">
					<GoGitPullRequest className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
					<Input
						className="h-8 text-sm pl-8 pr-3"
						placeholder="Paste PR URL..."
						value={prUrl}
						onChange={(e) => onPrUrlChange(e.target.value)}
						onKeyDown={handleKeyDown}
						disabled={isPending}
					/>
				</div>
				<Button
					variant="outline"
					size="sm"
					className="h-8 px-3"
					onClick={onSubmit}
					disabled={!prUrl.trim() || isPending}
				>
					{isPending ? <LuLoader className="size-3.5 animate-spin" /> : "Open"}
				</Button>
			</div>
		</div>
	);
}
