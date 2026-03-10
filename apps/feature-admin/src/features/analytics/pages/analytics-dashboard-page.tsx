import { useState } from 'react';
import { PageHeader } from '@superbuilder/feature-ui/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@superbuilder/feature-ui/shadcn/card';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { Skeleton } from '@superbuilder/feature-ui/shadcn/skeleton';
import { Users, Activity, CalendarDays, UserPlus } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useOverview, useTrend, useDistribution } from '../hooks';

interface Props {}

export function AnalyticsDashboardPage({}: Props) {
  const [days, setDays] = useState(30);
  const [metricKey, setMetricKey] = useState('sign_ups');

  const { data: overview, isLoading: overviewLoading } = useOverview();
  const { data: trend, isLoading: trendLoading } = useTrend(metricKey, days);
  const { data: distribution, isLoading: distLoading } = useDistribution();

  return (
    <div className="container mx-auto py-8">
      <PageHeader
        title="분석 대시보드"
        description="서비스 사용 지표를 확인합니다"
        actions={
          <div className="flex gap-1">
            {DATE_RANGE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={days === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDays(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        }
      />

      {/* KPI 카드 */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {overviewLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-20 mb-3" />
                  <Skeleton className="h-8 w-28" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <KpiCard
              title="총 사용자"
              value={overview?.totalUsers ?? 0}
              icon={<Users className="size-4 text-muted-foreground" />}
            />
            <KpiCard
              title="DAU"
              value={overview?.dau ?? 0}
              icon={<Activity className="size-4 text-muted-foreground" />}
            />
            <KpiCard
              title="MAU"
              value={overview?.mau ?? 0}
              icon={<CalendarDays className="size-4 text-muted-foreground" />}
            />
            <KpiCard
              title="신규 가입"
              value={overview?.newSignups ?? 0}
              icon={<UserPlus className="size-4 text-muted-foreground" />}
            />
          </>
        )}
      </div>

      {/* 트렌드 차트 */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>트렌드</CardTitle>
              <div className="flex gap-1">
                {METRIC_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={metricKey === opt.value ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setMetricKey(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <TrendChart data={trend ?? []} isLoading={trendLoading} />
          </CardContent>
        </Card>
      </div>

      {/* 분포 차트 */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>기능별 사용량</CardTitle>
          </CardHeader>
          <CardContent>
            <UsageBarChart data={distribution ?? []} isLoading={distLoading} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>이벤트 분포</CardTitle>
          </CardHeader>
          <CardContent>
            <DistributionPieChart data={distribution ?? []} isLoading={distLoading} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const DATE_RANGE_OPTIONS = [
  { label: '7일', value: 7 },
  { label: '30일', value: 30 },
  { label: '90일', value: 90 },
] as const;

const METRIC_OPTIONS = [
  { label: '가입', value: 'sign_ups' },
  { label: 'DAU', value: 'dau' },
  { label: '게시물', value: 'posts_created' },
  { label: 'AI 채팅', value: 'ai_chats' },
] as const;

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2, 173 58% 39%))',
  'hsl(var(--chart-3, 197 37% 24%))',
  'hsl(var(--chart-4, 43 74% 66%))',
  'hsl(var(--chart-5, 27 87% 67%))',
  'hsl(var(--destructive))',
];

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface KpiCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
}

function KpiCard({ title, value, icon }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          <span>{title}</span>
        </div>
        <p className="mt-2 text-3xl font-bold">{value.toLocaleString('ko-KR')}</p>
      </CardContent>
    </Card>
  );
}

interface TrendChartProps {
  data: Array<{ date: Date | string; value: number; metricKey: string }>;
  isLoading: boolean;
}

function TrendChart({ data, isLoading }: TrendChartProps) {
  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        데이터가 없습니다
      </div>
    );
  }

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
    value: d.value,
  }));

  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
        />
        <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '14px',
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface UsageBarChartProps {
  data: Array<{ eventType: string; count: number }>;
  isLoading: boolean;
}

function UsageBarChart({ data, isLoading }: UsageBarChartProps) {
  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        데이터가 없습니다
      </div>
    );
  }

  const sortedData = [...data]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((d) => ({
      name: d.eventType,
      value: d.count,
    }));

  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart data={sortedData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
        />
        <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '14px',
          }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {sortedData.map((_, index) => (
            <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

interface DistributionPieChartProps {
  data: Array<{ eventType: string; count: number }>;
  isLoading: boolean;
}

function DistributionPieChart({ data, isLoading }: DistributionPieChartProps) {
  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        데이터가 없습니다
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: d.eventType,
    value: d.count,
  }));

  return (
    <ResponsiveContainer width="100%" height={256}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          outerRadius={80}
          dataKey="value"
          label={(props) => {
            const { name, percent } = props as { name?: string; percent?: number };
            return `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`;
          }}
          labelLine={false}
        >
          {chartData.map((_, index) => (
            <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '14px',
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
