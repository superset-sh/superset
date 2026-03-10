import {
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { ArrowRight, CornerDownRight, Layers, GitBranch, X } from "lucide-react";

export type FlowEdgeData = {
  conditionLabel: string;
  transitionType: string;
  onDelete?: () => void;
};

type FlowEdgeType = Edge<FlowEdgeData, "flowEdge">;

export function FlowEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<FlowEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        className={cn(
          "transition-colors",
          selected ? "!stroke-primary !stroke-[2.5px]" : "!stroke-muted-foreground/40 !stroke-[1.5px]",
        )}
        markerEnd={`url(#${id}-arrow)`}
      />
      {/* Custom arrow marker */}
      <defs>
        <marker
          id={`${id}-arrow`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            className={selected ? "fill-primary" : "fill-muted-foreground/40"}
          />
        </marker>
      </defs>
      <EdgeLabelRenderer>
        <div
          className={cn(
            "absolute pointer-events-auto cursor-pointer nodrag nopan",
            "flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs shadow-sm",
            "transform -translate-x-1/2 -translate-y-1/2",
            "group/edge-label",
            selected ? "border-primary text-primary" : "border-border text-muted-foreground",
          )}
          style={{ left: labelX, top: labelY }}
        >
          <TransitionIcon type={data?.transitionType ?? "navigate"} />
          <span className="max-w-[120px] truncate">
            {data?.conditionLabel || data?.transitionType || ""}
          </span>
          {data?.onDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="ml-1 hidden size-4 rounded-full bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground group-hover/edge-label:flex"
              onClick={(e) => {
                e.stopPropagation();
                data.onDelete?.();
              }}
            >
              <X className="size-2.5" />
            </Button>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

/* Components */

function TransitionIcon({ type }: { type: string }) {
  const className = "size-3 shrink-0";
  switch (type) {
    case "redirect":
      return <CornerDownRight className={className} />;
    case "modal":
      return <Layers className={className} />;
    case "conditional":
      return <GitBranch className={className} />;
    default:
      return <ArrowRight className={className} />;
  }
}
