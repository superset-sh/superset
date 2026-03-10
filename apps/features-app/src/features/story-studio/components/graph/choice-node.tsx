/**
 * ChoiceNode - 선택지 노드
 *
 * BaseNode 래퍼 + outgoing 엣지 선택지 인라인 편집
 */
import { useState } from "react";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { useParams } from "@tanstack/react-router";
import type { NodeProps } from "@xyflow/react";
import { useUpdateEdge } from "../../hooks";
import { BaseNode } from "./base-node";

interface ChoiceItem {
  edgeId: string;
  label: string;
}

interface ChoiceNodeData {
  label: string;
  code: string;
  nodeType: string;
  isOrphan?: boolean;
  isIncomplete?: boolean;
  choices?: ChoiceItem[];
  [key: string]: unknown;
}

export function ChoiceNode({ data, selected, id }: NodeProps) {
  const nodeData = data as ChoiceNodeData;
  const { chId: chapterId } = useParams({ strict: false });
  const updateEdge = useUpdateEdge(chapterId ?? "");

  return (
    <BaseNode
      nodeId={id}
      nodeType="choice"
      selected={selected}
      handleColor="!bg-teal-500"
      className="group min-w-[180px]"
      isOrphan={nodeData.isOrphan}
      isIncomplete={nodeData.isIncomplete}
    >
      <div className="flex flex-col gap-2 p-4">
        <div>
          <div className="text-foreground text-base leading-6 font-medium">{nodeData.label}</div>
          <div className="text-muted-foreground mt-0.5 font-mono text-xs">{nodeData.code}</div>
        </div>

        {/* Editable choice list */}
        {nodeData.choices?.length ? (
          <div className="mt-2 space-y-1.5 border-t pt-3">
            {nodeData.choices.map((choice, i) => (
              <ChoiceItemEditor
                key={choice.edgeId}
                index={i}
                choice={choice}
                onSave={(label) =>
                  updateEdge.mutate({
                    id: choice.edgeId,
                    data: { label },
                  })
                }
              />
            ))}
          </div>
        ) : (
          <div className="mt-2 border-t pt-3">
            <p className="text-muted-foreground/80 text-xs">연결된 선택지가 없습니다</p>
          </div>
        )}
      </div>
    </BaseNode>
  );
}

/* Components */

interface ChoiceItemEditorProps {
  index: number;
  choice: ChoiceItem;
  onSave: (label: string) => void;
}

function ChoiceItemEditor({ index, choice, onSave }: ChoiceItemEditorProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(choice.label);

  // Sync when choice label changes from server
  if (!editing && editValue !== choice.label) {
    setEditValue(choice.label);
  }

  const handleSave = () => {
    setEditing(false);
    if (editValue !== choice.label) {
      onSave(editValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
    if (e.key === "Escape") {
      setEditValue(choice.label);
      setEditing(false);
    }
    // Prevent node deletion when typing
    e.stopPropagation();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground shrink-0 text-xs font-medium">{index + 1}.</span>
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          className="bg-background h-6 px-2 text-xs"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  return (
    <div
      className="group/choice hover:bg-muted/50 flex cursor-text items-center gap-2 rounded px-1 py-0.5"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      <span className="text-muted-foreground shrink-0 text-xs font-medium">{index + 1}.</span>
      <span className="text-muted-foreground min-w-0 truncate text-xs">
        {choice.label || "선택지 입력..."}
      </span>
    </div>
  );
}
