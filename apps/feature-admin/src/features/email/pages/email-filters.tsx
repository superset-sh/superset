import { Input } from '@superbuilder/feature-ui/shadcn/input';
import { Label } from '@superbuilder/feature-ui/shadcn/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@superbuilder/feature-ui/shadcn/select';
import type { EmailStatus, EmailTemplateType } from '../types';
import { EMAIL_STATUS_LABELS, EMAIL_TEMPLATE_LABELS } from '../types';

interface EmailFiltersProps {
  status?: EmailStatus;
  templateType?: EmailTemplateType;
  search?: string;
  onStatusChange: (status?: EmailStatus) => void;
  onTemplateTypeChange: (templateType?: EmailTemplateType) => void;
  onSearchChange: (search: string) => void;
}

/**
 * 이메일 로그 필터
 */
export function EmailFilters({
  status,
  templateType,
  search,
  onStatusChange,
  onTemplateTypeChange,
  onSearchChange,
}: EmailFiltersProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end">
      {/* 이메일 주소 검색 */}
      <div className="flex-1">
        <Label htmlFor="search">이메일 주소 검색</Label>
        <Input
          id="search"
          placeholder="user@example.com"
          value={search || ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
          className="mt-1"
        />
      </div>

      {/* 상태 필터 */}
      <div className="w-full md:w-[200px]">
        <Label htmlFor="status">상태</Label>
        <Select value={status || 'all'} onValueChange={(v: string | null) => onStatusChange(v === 'all' || !v ? undefined : (v as EmailStatus))}>
          <SelectTrigger id="status" className="mt-1">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {Object.entries(EMAIL_STATUS_LABELS).map(([value, label]: [string, string]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 템플릿 필터 */}
      <div className="w-full md:w-[200px]">
        <Label htmlFor="templateType">템플릿</Label>
        <Select
          value={templateType || 'all'}
          onValueChange={(v: string | null) => onTemplateTypeChange(v === 'all' || !v ? undefined : (v as EmailTemplateType))}
        >
          <SelectTrigger id="templateType" className="mt-1">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {Object.entries(EMAIL_TEMPLATE_LABELS).map(([value, label]: [string, string]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
