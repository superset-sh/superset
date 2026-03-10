import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Monitor, Smartphone, Layout, FileText, Link2 } from "lucide-react";

export type FlowScreenNodeData = {
  label: string;
  description: string;
  wireframeType: string;
  requirementCount: number;
};

type FlowScreenNodeType = Node<FlowScreenNodeData, "screenNode">;

const HANDLE_STYLE = "!bg-primary !w-2 !h-2 !min-w-0 !min-h-0";

export function FlowScreenNode({ data, selected }: NodeProps<FlowScreenNodeType>) {
  const truncatedDesc =
    data.description.length > 60 ? `${data.description.slice(0, 60)}...` : data.description;

  return (
    <div
      className={cn(
        "rounded-lg border bg-background px-4 py-3 shadow-sm transition-all w-[220px]",
        selected
          ? "border-primary ring-2 ring-primary/20"
          : "border-border hover:border-primary/50",
      )}
    >
      {/* 4-directional handles: each is both source and target */}
      <Handle type="target" position={Position.Top} id="top" className={HANDLE_STYLE} />
      <Handle type="source" position={Position.Top} id="top-source" className={cn(HANDLE_STYLE, "!opacity-0 !pointer-events-auto")} />

      <Handle type="target" position={Position.Bottom} id="bottom" className={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className={cn(HANDLE_STYLE, "!opacity-0 !pointer-events-auto")} />

      <Handle type="source" position={Position.Right} id="right" className={HANDLE_STYLE} />
      <Handle type="target" position={Position.Right} id="right-target" className={cn(HANDLE_STYLE, "!opacity-0 !pointer-events-auto")} />

      <Handle type="source" position={Position.Left} id="left" className={HANDLE_STYLE} />
      <Handle type="target" position={Position.Left} id="left-target" className={cn(HANDLE_STYLE, "!opacity-0 !pointer-events-auto")} />

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <WireframeIcon type={data.wireframeType} />
          <span className="text-sm font-medium truncate">{data.label}</span>
        </div>
        {data.requirementCount > 0 ? (
          <Badge variant="secondary" className="shrink-0 text-xs px-1.5 py-0">
            {data.requirementCount}
          </Badge>
        ) : null}
      </div>

      {truncatedDesc ? (
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {truncatedDesc}
        </p>
      ) : null}

      {data.wireframeType ? (
        <Badge variant="outline" className="mt-2 text-[10px] px-1.5 py-0">
          {data.wireframeType}
        </Badge>
      ) : null}
    </div>
  );
}

/* Components */

function WireframeIcon({ type }: { type: string }) {
  const className = "size-4 text-muted-foreground shrink-0";
  const lower = type.toLowerCase();

  if (lower.includes("mobile")) return <Smartphone className={className} />;
  if (lower.includes("desktop")) return <Monitor className={className} />;
  if (lower.includes("form") || lower.includes("input")) return <FileText className={className} />;
  if (lower.includes("link") || lower.includes("nav")) return <Link2 className={className} />;
  return <Layout className={className} />;
}
