/**
 * CustomEdge - 커스텀 엣지 컴포넌트
 *
 * - SmoothStep 경로 (borderRadius: 8)
 * - 호버 시 두꺼운 스트로크 (2 -> 3)
 * - 화살표 마커
 * - 조건 엣지: 대시선 + 보라색
 * - 레이블 배지
 */
import { useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { cn } from "@superbuilder/feature-ui/lib/utils";

interface EdgeCondition {
  type: "flag_check" | "group";
  flagId?: string;
  operator?: "==" | "!=" | ">" | ">=" | "<" | "<=";
  value?: string | number | boolean;
  logic?: "AND" | "OR";
  children?: EdgeCondition[];
}

interface EdgeEffect {
  flagId: string;
  operation: "set" | "add" | "subtract" | "toggle" | "multiply";
  value: string | number | boolean;
}

interface CustomEdgeData {
  conditions?: EdgeCondition[];
  effects?: EdgeEffect[];
  [key: string]: unknown;
}

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
  selected,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);

  const edgeData = data as CustomEdgeData | undefined;
  const hasConditions = (edgeData?.conditions?.length ?? 0) > 0;
  const hasEffects = (edgeData?.effects?.length ?? 0) > 0;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });

  const strokeWidth = hovered ? 3 : 2;
  const strokeColor = hasConditions ? "var(--color-purple-500)" : "var(--color-muted-foreground)";
  const strokeDasharray = hasConditions ? "6 3" : undefined;

  return (
    <>
      {/* Invisible wider path for easier hover */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />

      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          strokeWidth,
          stroke: strokeColor,
          strokeDasharray,
          transition: "stroke-width 0.15s ease",
        }}
        markerEnd="url(#arrow)"
      />

      {/* Label badge */}
      {label ? (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "nodrag nopan pointer-events-auto absolute rounded-full px-2 py-0.5 text-[10px] font-medium shadow-sm",
              hasConditions
                ? "border border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/50 dark:text-purple-300"
                : "border border-border bg-background text-foreground",
              selected && "ring-primary ring-1",
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}

      {/* Condition/Effect indicator (small dot) */}
      {!label && (hasConditions || hasEffects) ? (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "nodrag nopan pointer-events-none absolute flex gap-0.5",
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {hasConditions ? (
              <div className="h-2 w-2 rounded-full bg-purple-500" title="조건 있음" />
            ) : null}
            {hasEffects ? (
              <div className="h-2 w-2 rounded-full bg-amber-500" title="효과 있음" />
            ) : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
