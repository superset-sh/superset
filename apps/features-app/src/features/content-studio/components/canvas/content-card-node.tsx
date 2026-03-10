/**
 * ContentCardNode — Figma 디자인 기반 콘텐츠 카드 노드
 */
import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
import {
  ChevronDown, MoreHorizontal,
  Pencil, Trash2, Repeat,
  Eye, MessageSquare,
  LayoutGrid, Video, Mail,
} from "lucide-react";

interface ContentCardNodeData {
  title: string;
  status: string;
  authorName?: string | null;
  viewCount?: number;
  commentCount?: number;
  topicLabel?: string | null;
  repurposeFormat?: string | null;
  derivedFromId?: string | null;
  onEdit?: () => void;
  onDelete?: () => void;
  onRepurpose?: () => void;
  [key: string]: unknown;
}

function ContentCardNodeInner({ data }: NodeProps<Node<ContentCardNodeData>>) {
  const d = data as ContentCardNodeData;
  const statusCfg = STATUS_CONFIG[d.status] ?? { label: "초안", bgColor: "rgba(23,23,23,0.1)", textColor: "#171717" };
  const fmt = d.repurposeFormat ? FORMAT_ICON[d.repurposeFormat] : null;

  return (
    <div 
      className="group relative w-[324px] rounded-2xl border bg-background/95 backdrop-blur-sm p-4 shadow-sm transition-shadow hover:shadow-md cursor-pointer"
      style={{ borderRadius: "16px" }}
    >
      {/* 4-Way Handles - Source and Target pairs at each position */}
      {/* Top */}
      <Handle type="target" position={Position.Top} id="top-target" className="!w-2.5 !h-2.5 !border-2 !border-background !bg-primary" />
      <Handle type="source" position={Position.Top} id="top-source" className="!w-2.5 !h-2.5 !border-2 !border-background !bg-primary" />
      
      {/* Right */}
      <Handle type="target" position={Position.Right} id="right-target" className="!w-2.5 !h-2.5 !border-2 !border-background !bg-primary" />
      <Handle type="source" position={Position.Right} id="right-source" className="!w-2.5 !h-2.5 !border-2 !border-background !bg-primary" />
      
      {/* Bottom */}
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="!w-2.5 !h-2.5 !border-2 !border-background !bg-primary" />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className="!w-2.5 !h-2.5 !border-2 !border-background !bg-primary" />
      
      {/* Left */}
      <Handle type="target" position={Position.Left} id="left-target" className="!w-2.5 !h-2.5 !border-2 !border-background !bg-primary" />
      <Handle type="source" position={Position.Left} id="left-source" className="!w-2.5 !h-2.5 !border-2 !border-background !bg-primary" />

      {/* 1행: 제목 + 액션 */}
      <div className="flex gap-2 items-start">
        <div className="flex-1 min-w-0">
          <p className="text-base font-medium leading-6 text-foreground whitespace-pre-wrap">
            {d.title}
          </p>
        </div>
        <div className="flex items-center shrink-0 nodrag nopan">
          <button
            className="inline-flex items-center justify-center rounded-lg p-1.5 hover:bg-muted transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
          <NodeMenu
            onEdit={d.onEdit}
            onDelete={d.onDelete}
            onRepurpose={!d.derivedFromId ? d.onRepurpose : undefined}
          />
        </div>
      </div>

      {/* 2행: 상태 배지 + 리퍼포징 포맷 */}
      <div className="flex items-center gap-1.5 mt-2">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: statusCfg.bgColor, color: statusCfg.textColor }}
        >
          {statusCfg.label}
        </span>
        {fmt && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
            <fmt.icon className="h-3 w-3" />
            {fmt.label}
          </span>
        )}
      </div>

      {/* 3행: 저자 + 조회수 + 댓글 */}
      <div className="flex items-center gap-3 mt-3">
        {d.authorName && (
          <span className="flex-1 text-sm text-foreground truncate">{d.authorName}</span>
        )}
        <div className="flex items-center gap-2 shrink-0">
          {typeof d.viewCount === "number" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground">
              <Eye className="h-3.5 w-3.5" />
              {formatCount(d.viewCount)}
            </span>
          )}
          {typeof d.commentCount === "number" && d.commentCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-1.5 py-0.5 text-xs font-medium text-foreground">
              {d.commentCount}개의 댓글
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export const ContentCardNode = memo(ContentCardNodeInner);

const STATUS_CONFIG: Record<string, { label: string; bgColor: string; textColor: string }> = {
  draft: { label: "초안", bgColor: "rgba(23,23,23,0.1)", textColor: "#171717" },
  writing: { label: "작성 중", bgColor: "rgba(59,130,246,0.1)", textColor: "#2563eb" },
  review: { label: "검토", bgColor: "rgba(234,179,8,0.1)", textColor: "#ca8a04" },
  published: { label: "배포됨", bgColor: "rgba(22,163,74,0.1)", textColor: "#16a34a" },
  canceled: { label: "취소", bgColor: "rgba(239,68,68,0.1)", textColor: "#dc2626" },
};

const FORMAT_ICON: Record<string, { icon: typeof LayoutGrid; label: string }> = {
  card_news: { icon: LayoutGrid, label: "카드 뉴스" },
  short_form: { icon: Video, label: "숏폼" },
  twitter_thread: { icon: MessageSquare, label: "스레드" },
  email_summary: { icon: Mail, label: "이메일" },
};

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

interface NodeMenuProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onRepurpose?: () => void;
}

function NodeMenu({ onEdit, onDelete, onRepurpose }: NodeMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center justify-center rounded-lg p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
        onClick={(e) => e.stopPropagation()}
      >
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {onEdit && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Pencil className="mr-2 h-3.5 w-3.5" />수정
          </DropdownMenuItem>
        )}
        {onRepurpose && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRepurpose(); }}>
            <Repeat className="mr-2 h-3.5 w-3.5" />리퍼포징
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />삭제
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
