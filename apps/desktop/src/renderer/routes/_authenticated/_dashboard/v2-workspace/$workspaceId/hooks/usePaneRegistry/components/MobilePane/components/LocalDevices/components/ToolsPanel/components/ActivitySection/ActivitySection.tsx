import type { DeviceActivity } from "@expo/hub-client";
import { Trans, useLingui } from "@lingui/react/macro";
import {
	formatCpu,
	formatMemory,
} from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/ResourceConsumption/utils/formatters";
import { ResourceSparkline } from "renderer/routes/_authenticated/components/ResourceSparkline";
import { ToolsSection } from "../ToolsSection";

interface ActivitySectionProps {
	activity: DeviceActivity | null;
}

const formatRate = (bytesPerSecond: number) =>
	`${formatMemory(bytesPerSecond)}/s`;

export function ActivitySection({ activity }: ActivitySectionProps) {
	const { t } = useLingui();
	const samples = (activity?.samples ?? []).map((sample) => ({
		at: sample.t,
		cpu: sample.cpuPct,
		memory: sample.memBytes,
		network: sample.netInBytesPerSec + sample.netOutBytesPerSec,
	}));
	const latest = samples.at(-1);

	return (
		<ToolsSection
			title={<Trans>Activity</Trans>}
			summary={
				latest && `${formatCpu(latest.cpu)} · ${formatMemory(latest.memory)}`
			}
			defaultOpen
		>
			{!latest ? (
				<div className="py-2 text-center text-xs text-muted-foreground">
					<Trans>Waiting for activity data</Trans>
				</div>
			) : (
				<>
					<ResourceSparkline
						label={t({ message: "CPU" })}
						current={formatCpu(latest.cpu)}
						color="var(--chart-1)"
						samples={samples}
						getValue={(sample) => sample.cpu}
						formatValue={formatCpu}
						compact
					/>
					<ResourceSparkline
						label={t({ message: "Memory" })}
						current={formatMemory(latest.memory)}
						color="var(--chart-2)"
						samples={samples}
						getValue={(sample) => sample.memory}
						formatValue={formatMemory}
						compact
					/>
					<ResourceSparkline
						label={t({ message: "Network" })}
						current={formatRate(latest.network)}
						color="var(--chart-3)"
						samples={samples}
						getValue={(sample) => sample.network}
						formatValue={formatRate}
						compact
					/>
				</>
			)}
		</ToolsSection>
	);
}
