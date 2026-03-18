"use client";

import { Button } from "@superset/ui/button";
import { Archive, MoreHorizontal, Share2, Trash2 } from "lucide-react";
import { ResponsiveDropdown } from "../../../components/ResponsiveDropdown";

export function SessionMenu() {
	return (
		<ResponsiveDropdown
			align="end"
			title="Session options"
			items={[
				{
					label: "Archive",
					icon: <Archive className="size-4" />,
					onSelect: () => {},
				},
				{
					label: "Share",
					icon: <Share2 className="size-4" />,
					onSelect: () => {},
				},
				{
					label: "Delete",
					icon: <Trash2 className="size-4" />,
					onSelect: () => {},
					className: "text-destructive",
				},
			]}
			trigger={
				<Button variant="ghost" size="icon-sm" aria-label="Session menu">
					<MoreHorizontal className="size-4" />
				</Button>
			}
		/>
	);
}
