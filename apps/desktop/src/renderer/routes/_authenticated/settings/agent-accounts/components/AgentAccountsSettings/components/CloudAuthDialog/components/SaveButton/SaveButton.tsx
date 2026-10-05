import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";

export function SaveButton({
	checking,
	disabled,
	onClick,
}: {
	checking: boolean;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<Button
			className="grid place-items-center *:[grid-area:1/1]"
			disabled={disabled || checking}
			onClick={onClick}
			size="sm"
		>
			<span className={cn(checking && "invisible")}>
				<Trans>Save</Trans>
			</span>
			{checking ? <Spinner /> : null}
		</Button>
	);
}
