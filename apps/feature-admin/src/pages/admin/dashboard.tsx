/**
 * Admin Dashboard
 */
import { profileAtom } from "@superbuilder/features-client/core/auth";
import { useAtomValue } from "jotai";

export function AdminDashboard() {
  const profile = useAtomValue(profileAtom);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome, {profile?.name ?? "Admin"}</p>
      </div>
    </div>
  );
}
