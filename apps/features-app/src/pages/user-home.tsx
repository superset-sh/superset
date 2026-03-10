/**
 * User Home - 일반 유저 대시보드
 */
import { profileAtom } from "@superbuilder/features-client/core/auth";
import { useAtomValue } from "jotai";

export function UserHome() {
  const profile = useAtomValue(profileAtom);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Welcome, {profile?.name ?? "User"}</h1>
        <p className="text-muted-foreground">This is your personal dashboard</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <DashboardCard title="My Projects" value="—" description="Active projects" />
        <DashboardCard title="Recent Activity" value="—" description="Last 7 days" />
        <DashboardCard title="Notifications" value="—" description="Unread messages" />
      </div>
    </div>
  );
}

function DashboardCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="bg-card rounded-lg border p-6">
      <p className="text-muted-foreground text-sm font-medium">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-muted-foreground text-xs">{description}</p>
    </div>
  );
}
