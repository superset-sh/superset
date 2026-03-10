import { cn } from "../lib/utils";

// ============================================================================
// Types
// ============================================================================

interface PageHeaderProps {
  /** 페이지 제목 */
  title: string;
  /** 페이지 설명 (선택) */
  description?: string;
  /** 제목 앞 아이콘 (선택) */
  icon?: React.ReactNode;
  /** 우측 액션 영역 (선택) */
  actions?: React.ReactNode;
  /** 추가 className */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function PageHeader({ title, description, icon, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            {icon}
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}
