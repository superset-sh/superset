import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import { Spinner } from "@superbuilder/feature-ui/shadcn/spinner";
import {
  useUsageSummary,
  useUsageByModel,
  useUsageByAgent,
} from "../hooks/use-usage";

export function AgentUsagePage() {
  const [days, setDays] = useState(30);
  const { data: summary, isLoading: loadingSummary } = useUsageSummary(days);
  const { data: byModel, isLoading: loadingModel } = useUsageByModel(days);
  const { data: byAgent, isLoading: loadingAgent } = useUsageByAgent(days);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AI 사용량 대시보드</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            에이전트 사용량과 토큰 소비를 모니터링합니다.
          </p>
        </div>
          <Select
            value={String(days)}
            onValueChange={(v) => setDays(Number(v))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">최근 7일</SelectItem>
              <SelectItem value="30">최근 30일</SelectItem>
              <SelectItem value="90">최근 90일</SelectItem>
            </SelectContent>
          </Select>
      </div>
      <div className="space-y-8">
          {/* 요약 카드 */}
          {loadingSummary ? (
            <div className="flex items-center justify-center py-10">
              <Spinner />
            </div>
          ) : summary ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <SummaryCard
                title="총 요청"
                value={summary.totalRequests?.toLocaleString() ?? "0"}
              />
              <SummaryCard
                title="프롬프트 토큰"
                value={summary.totalPromptTokens?.toLocaleString() ?? "0"}
              />
              <SummaryCard
                title="완료 토큰"
                value={
                  summary.totalCompletionTokens?.toLocaleString() ?? "0"
                }
              />
              <SummaryCard
                title="평균 응답시간"
                value={`${summary.avgDurationMs ?? 0}ms`}
              />
            </div>
          ) : null}

          {/* 모델별 사용량 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium">모델별 사용량</h2>
            {loadingModel ? (
              <Spinner />
            ) : !byModel?.length ? (
              <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>모델</TableHead>
                    <TableHead className="text-right">요청 수</TableHead>
                    <TableHead className="text-right">
                      프롬프트 토큰
                    </TableHead>
                    <TableHead className="text-right">완료 토큰</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byModel.map((row: any) => (
                    <TableRow key={row.modelId}>
                      <TableCell className="font-medium">
                        {row.modelId}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.requests.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.promptTokens.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.completionTokens.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>

          {/* 에이전트별 사용량 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium">에이전트별 사용량</h2>
            {loadingAgent ? (
              <Spinner />
            ) : !byAgent?.length ? (
              <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>에이전트</TableHead>
                    <TableHead className="text-right">요청 수</TableHead>
                    <TableHead className="text-right">
                      프롬프트 토큰
                    </TableHead>
                    <TableHead className="text-right">완료 토큰</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byAgent.map((row: any) => (
                    <TableRow key={row.agentId}>
                      <TableCell className="font-medium">
                        {row.agentName}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.requests.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.promptTokens.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.completionTokens.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </div>
      </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
