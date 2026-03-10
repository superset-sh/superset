/**
 * StartEndNode - 시작/종료/병합 노드
 *
 * BaseNode 래퍼, 원형 variant, 타입별 색상
 */
import { cn } from "@superbuilder/feature-ui/lib/utils";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "./base-node";

interface StartEndNodeData {
  label: string;
  code: string;
  nodeType?: string;
  // Validation indicators
  isOrphan?: boolean;
  isIncomplete?: boolean;
  [key: string]: unknown;
}

const NODE_STYLES = {
  start: {
    handle: "!bg-blue-500",
  },
  end: {
    handle: "!bg-rose-500",
  },
  merge: {
    handle: "!bg-slate-500",
  },
} as const;

export function StartEndNode({ data, selected, id }: NodeProps) {
  const nodeData = data as StartEndNodeData;
  const nodeType = (nodeData.nodeType ?? "start") as keyof typeof NODE_STYLES;
  const styles = NODE_STYLES[nodeType] ?? NODE_STYLES.start;

  return (
    <BaseNode
      nodeId={id}
      nodeType={nodeType as "start" | "end" | "merge"}
      selected={selected}
      variant="circular"
      handleColor={styles.handle}
      className={cn("group min-w-[100px]")}
      isOrphan={nodeData.isOrphan}
      isIncomplete={nodeData.isIncomplete}
    >
      <div className="flex flex-col items-center justify-center p-3">
        <div className={cn("text-foreground text-sm font-medium")}>{nodeData.label}</div>
        <div className={cn("text-muted-foreground mt-0.5 font-mono text-[10px]")}>
          {nodeData.code}
        </div>
      </div>
    </BaseNode>
  );
}
