import { Button } from '@superbuilder/feature-ui/shadcn/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@superbuilder/feature-ui/shadcn/card';
import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
interface RoleCardProps {
  role: any;
  permissionCount?: number;
  userCount?: number;
  onEdit?: (role: any) => void;
  onDelete?: (role: any) => void;
  onManagePermissions?: (role: any) => void;
}

export function RoleCard({
  role,
  permissionCount,
  userCount,
  onEdit,
  onDelete,
  onManagePermissions,
}: RoleCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {role.icon && <span className="text-lg">{role.icon}</span>}
            <CardTitle>{role.name}</CardTitle>
          </div>
          {role.isSystem && (
            <Badge variant="secondary" className="ml-2">
              System
            </Badge>
          )}
        </div>
        <CardDescription>{role.description || 'No description'}</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Permissions:</span>
            <span className="font-medium">{permissionCount ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Users:</span>
            <span className="font-medium">{userCount ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Priority:</span>
            <span className="font-medium">{role.priority}</span>
          </div>
          {role.color && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Color:</span>
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full border"
                  style={{ backgroundColor: role.color }}
                />
                <span className="text-xs font-mono">{role.color}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>

      {(onEdit || onDelete || onManagePermissions) && (
        <CardFooter className="flex gap-2">
          {onManagePermissions && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onManagePermissions(role)}
              className="flex-1"
            >
              Permissions
            </Button>
          )}
          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(role)}
              disabled={role.isSystem}
              className="flex-1"
            >
              Edit
            </Button>
          )}
          {onDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(role)}
              disabled={role.isSystem}
              className="flex-1"
            >
              Delete
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
