/**
 * AccountManager - SNS 계정 관리
 */
import { useSnsAccounts, useDisconnectSnsAccount } from "../hooks";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import { Unlink } from "lucide-react";

export function AccountManager() {
  const { data: accounts, isLoading } = useSnsAccounts();
  const disconnectAccount = useDisconnectSnsAccount();

  const handleDisconnect = (accountId: string, platform: string) => {
    if (!confirm(`${platform} 계정 연결을 해제하시겠습니까?`)) return;
    disconnectAccount.mutate(accountId);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/3" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const accountList = (accounts as unknown as SnsAccountItem[]) ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>SNS 계정 관리</CardTitle>
        <p className="text-sm text-muted-foreground">
          {accountList.length}개 계정 연결됨
        </p>
      </CardHeader>
      <CardContent>
        {accountList.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            연결된 SNS 계정이 없습니다.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>플랫폼</TableHead>
                <TableHead>계정명</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>연결일</TableHead>
                <TableHead className="text-right">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountList.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <Badge variant="outline">{PLATFORM_LABEL[account.platform] ?? account.platform}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {account.accountName ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={account.isActive ? "default" : "secondary"}>
                      {account.isActive ? "활성" : "비활성"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(account.createdAt).toLocaleDateString("ko-KR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDisconnect(account.id, account.platform)}
                      disabled={disconnectAccount.isPending}
                    >
                      <Unlink className="mr-1 h-3.5 w-3.5" />
                      해제
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  x: "X (Twitter)",
  linkedin: "LinkedIn",
};

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface SnsAccountItem {
  id: string;
  platform: string;
  accountName: string | null;
  isActive: boolean;
  createdAt: string;
}
