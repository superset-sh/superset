/**
 * ConditionNode - 조건 분기 노드
 *
 * BaseNode 래퍼, 보라색 다이아몬드 스타일
 */
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "./base-node";

interface ConditionNodeData {
  label: string;
  code: string;
  nodeType: string;
  // Validation indicators
  isOrphan?: boolean;
  isIncomplete?: boolean;
  [key: string]: unknown;
}

export function ConditionNode({ data, selected, id }: NodeProps) {
  const nodeData = data as ConditionNodeData;

  return (
    <BaseNode
      nodeId={id}
      nodeType="condition"
      selected={selected}
      handleColor="!bg-purple-500"
      className="group min-w-[140px]"
      isOrphan={nodeData.isOrphan}
      isIncomplete={nodeData.isIncomplete}
    >
      <div className="flex flex-col items-center justify-center p-4">
        <div className="text-muted-foreground mb-1 text-[10px] font-bold tracking-widest uppercase">
          Condition
        </div>
        <div className="text-foreground text-sm leading-tight font-medium">{nodeData.label}</div>
        <div className="text-muted-foreground mt-0.5 font-mono text-[10px]">{nodeData.code}</div>
      </div>
    </BaseNode>
  );
}
