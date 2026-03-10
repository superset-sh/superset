/**
 * Quick Booking Dialog - 빈 시간 슬롯 더블클릭 시 상담사 선택 모달
 *
 * 선택한 날짜/시간 컨텍스트를 표시하고, 상담사를 검색·선택하면
 * 예약 생성 페이지(/booking/new)로 이동합니다.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Calendar, Clock, Monitor, MapPin, Repeat, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { useProviderSearch } from "../hooks";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 더블클릭한 날짜 (YYYY-MM-DD) */
  selectedDate: string | null;
  /** 더블클릭한 시간 (정시 hour) */
  selectedHour: number | null;
}

export function QuickBookingDialog({
  open,
  onOpenChange,
  selectedDate,
  selectedHour,
}: Props) {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");

  const { data: searchResult, isLoading } = useProviderSearch({
    keyword: searchKeyword || undefined,
    date: selectedDate ?? undefined,
    limit: 20,
  });

  const providers = searchResult?.data ?? [];

  const handleSearch = () => {
    setSearchKeyword(keyword);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleProviderClick = (providerId: string) => {
    onOpenChange(false);
    setKeyword("");
    setSearchKeyword("");
    navigate({
      to: "/booking/new",
      search: { providerId },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setKeyword("");
          setSearchKeyword("");
        }
      }}
    >
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>예약 생성</DialogTitle>
        </DialogHeader>

        {/* 선택한 날짜/시간 컨텍스트 */}
        {selectedDate && (
          <div className="flex items-center gap-4 rounded-lg bg-muted/50 px-4 py-3">
            <div className="flex items-center gap-1.5 text-sm">
              <Calendar className="size-4 text-muted-foreground" />
              <span className="font-medium">{formatDateKr(selectedDate)}</span>
            </div>
            {selectedHour != null && (
              <div className="flex items-center gap-1.5 text-sm">
                <Clock className="size-4 text-muted-foreground" />
                <span className="font-medium">{selectedHour}:00</span>
              </div>
            )}
          </div>
        )}

        {/* 검색 */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="상담사 이름, 키워드..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-9"
            />
          </div>
        </div>

        {/* 상담사 목록 */}
        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          {isLoading ? (
            <ProviderListSkeleton />
          ) : providers.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              조건에 맞는 상담사가 없습니다.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {providers.map((provider) => (
                <ProviderListItem
                  key={provider.id}
                  provider={provider}
                  onClick={() => handleProviderClick(provider.id)}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface ProviderListItemProps {
  provider: {
    id: string;
    name: string;
    avatar: string | null;
    bio: string | null;
    experienceYears: number | null;
    consultationMode: string;
    categories: { id: string; name: string }[];
    products: { id: string; name: string; durationMinutes: number; price: number }[];
  };
  onClick: () => void;
}

function ProviderListItem({ provider, onClick }: ProviderListItemProps) {
  const initials = provider.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const modeLabel = CONSULTATION_MODE[provider.consultationMode];
  const priceRange = getPriceRange(provider.products);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 rounded-lg border bg-background p-4 text-left",
        "hover:border-primary/50 transition-colors cursor-pointer",
      )}
    >
      {/* 아바타 */}
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground shrink-0">
        {provider.avatar ? (
          <img
            src={provider.avatar}
            alt={provider.name}
            className="size-full rounded-full object-cover"
          />
        ) : (
          initials
        )}
      </div>

      {/* 정보 */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{provider.name}</span>
          {provider.experienceYears != null && (
            <span className="text-sm text-muted-foreground shrink-0">
              경력 {provider.experienceYears}년
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {provider.categories.slice(0, 2).map((cat) => (
            <Badge key={cat.id} variant="secondary" className="text-xs">
              {cat.name}
            </Badge>
          ))}
          {provider.categories.length > 2 && (
            <Badge variant="secondary" className="text-xs">
              +{provider.categories.length - 2}
            </Badge>
          )}
        </div>
      </div>

      {/* 우측: 가격 + 상담 방식 */}
      <div className="shrink-0 text-right space-y-1">
        {priceRange && (
          <p className="text-sm font-medium">{priceRange}</p>
        )}
        {modeLabel && (
          <div className="flex items-center justify-end gap-1 text-sm text-muted-foreground">
            <modeLabel.icon className="size-3.5" />
            <span>{modeLabel.label}</span>
          </div>
        )}
      </div>
    </button>
  );
}

function ProviderListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg border p-4">
          <Skeleton className="size-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-28" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-18 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatDateKr(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function getPriceRange(products: { price: number }[]): string | null {
  if (products.length === 0) return null;
  const prices = products.map((p) => p.price);
  const min = Math.min(...prices);
  const fmt = (n: number) => new Intl.NumberFormat("ko-KR").format(n) + "원~";
  return fmt(min);
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const CONSULTATION_MODE: Record<string, { icon: typeof Monitor; label: string }> = {
  online: { icon: Monitor, label: "온라인" },
  offline: { icon: MapPin, label: "오프라인" },
  hybrid: { icon: Repeat, label: "혼합" },
};
