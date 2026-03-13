import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuChevronDown,
	LuChevronRight,
	LuPlay,
	LuTestTube,
} from "react-icons/lu";

interface TestResultsSectionProps {
	data:
		| {
				total: number;
				passed: number;
				failed: number;
				skipped: number;
				duration: number | null;
				lastRun: string | null;
				failedTests: string[];
		  }
		| undefined;
	isLoading: boolean;
	onRerun: () => void;
}

export function TestResultsSection({
	data,
	isLoading,
	onRerun,
}: TestResultsSectionProps) {
	const [collapsed, setCollapsed] = useState(false);

	return (
		<div className="overflow-hidden border-t border-border">
			<button
				type="button"
				onClick={() => setCollapsed(!collapsed)}
				className={cn(
					"flex w-full items-center gap-1.5 px-3 py-2",
					"text-xs font-medium uppercase tracking-wider text-muted-foreground",
					"hover:bg-accent/30 cursor-pointer transition-colors",
				)}
			>
				{collapsed ? (
					<LuChevronRight className="size-3 shrink-0" />
				) : (
					<LuChevronDown className="size-3 shrink-0" />
				)}
				<LuTestTube className="size-3 shrink-0" />
				<span>Tests</span>
				{data && data.total > 0 && (
					<span
						className={cn(
							"ml-auto text-[10px] px-1.5 py-0.5 rounded-full tabular-nums",
							data.failed > 0
								? "bg-destructive/10 text-destructive"
								: "bg-green-500/10 text-green-500",
						)}
					>
						{data.passed}/{data.total}
					</span>
				)}
			</button>

			{!collapsed && (
				<div className="px-3 py-2 text-sm">
					{isLoading ? (
						<p className="text-muted-foreground">Loading...</p>
					) : !data || data.total === 0 ? (
						<div className="space-y-2">
							<p className="text-muted-foreground text-xs">
								No test results found
							</p>
							<Button
								variant="ghost"
								size="sm"
								className="w-full h-7 text-xs"
								onClick={onRerun}
							>
								<LuPlay className="size-3 mr-1.5" />
								Run Tests
							</Button>
						</div>
					) : (
						<div className="space-y-2">
							<div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
								<span className="text-green-500">
									{data.passed} passed
								</span>
								{data.failed > 0 && (
									<span className="text-destructive">
										{data.failed} failed
									</span>
								)}
								{data.skipped > 0 && (
									<span className="text-muted-foreground">
										{data.skipped} skipped
									</span>
								)}
							</div>
							{data.failedTests.length > 0 && (
								<div className="space-y-0.5">
									{data.failedTests.map((test) => (
										<p
											key={test}
											className="text-xs text-destructive truncate font-mono"
										>
											{test}
										</p>
									))}
								</div>
							)}
							<Button
								variant="ghost"
								size="sm"
								className="w-full h-7 text-xs"
								onClick={onRerun}
							>
								<LuPlay className="size-3 mr-1.5" />
								Re-run Tests
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
