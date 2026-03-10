/**
 * Booking Search - 상담사 탐색 (Public)
 */
import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { useBookingCategories, useProviderSearch } from "../hooks";
import { ProviderCard } from "../components/provider-card";

export function BookingSearch() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [consultationMode, setConsultationMode] = useState<string>("");

  const { data: categories } = useBookingCategories();
  const { data: searchResult, isLoading } = useProviderSearch({
    keyword: searchKeyword || undefined,
    categoryId: categoryId || undefined,
    consultationMode: (consultationMode as "online" | "offline" | "hybrid") || undefined,
    page,
    limit: 12,
  });

  const handleSearch = () => {
    setSearchKeyword(keyword);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div>
        <h1 className="text-3xl font-bold">상담사 찾기</h1>
        <p className="text-muted-foreground mt-2">
          나에게 맞는 상담사를 찾아보세요.
        </p>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={categoryId}
          onValueChange={(v: string | null) => {
            setCategoryId(v ?? "");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">전체 카테고리</SelectItem>
            {categories?.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={consultationMode}
          onValueChange={(v: string | null) => {
            setConsultationMode(v ?? "");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="상담 방식" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">전체 방식</SelectItem>
            <SelectItem value="online">온라인</SelectItem>
            <SelectItem value="offline">오프라인</SelectItem>
            <SelectItem value="hybrid">혼합</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input
            placeholder="키워드 검색..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-[200px]"
          />
          <Button variant="outline" size="icon" onClick={handleSearch}>
            <Search className="size-4" />
            <span className="sr-only">검색</span>
          </Button>
        </div>
      </div>

      {/* 결과 */}
      {isLoading ? (
        <SearchSkeleton />
      ) : !searchResult?.data?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          조건에 맞는 상담사가 없습니다.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {searchResult.data.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))}
          </div>

          {/* 페이지네이션 */}
          {searchResult.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                이전
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {searchResult.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= searchResult.totalPages}
                onClick={() => setPage(page + 1)}
              >
                다음
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function SearchSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-6 space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-10 w-full" />
          <div className="flex justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
