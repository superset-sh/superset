"use client";

import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { MockSession } from "../../../mock-data";

type SessionHeaderProps = {
	session: MockSession;
};

export function SessionHeader({ session }: SessionHeaderProps) {
	const router = useRouter();

	return (
		<div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
			<Button
				variant="ghost"
				size="icon-sm"
				onClick={() => router.push("/")}
				aria-label="Back"
			>
				<ArrowLeft className="size-4" />
			</Button>
			<h1 className="min-w-0 flex-1 truncate text-sm font-medium">
				{session.title}
			</h1>
			<Badge variant="secondary">Preview</Badge>
		</div>
	);
}
