import { useState } from 'react';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import { Checkbox } from '@superbuilder/feature-ui/shadcn/checkbox';
import { Label } from '@superbuilder/feature-ui/shadcn/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@superbuilder/feature-ui/shadcn/card';
import { ScrollArea } from '@superbuilder/feature-ui/shadcn/scroll-area';
import type { Role } from '@superbuilder/drizzle';

interface UserRoleEditorProps {
  availableRoles: Role[];
  currentRoleIds: string[];
  onSave: (roleIds: string[]) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  userId?: string;
  userName?: string;
}

export function UserRoleEditor({
  availableRoles,
  currentRoleIds,
  onSave,
  onCancel,
  isLoading = false,
  userName,
}: UserRoleEditorProps) {
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(currentRoleIds);

  const isRoleSelected = (roleId: string) => selectedRoleIds.includes(roleId);

  const toggleRole = (roleId: string) => {
    if (isRoleSelected(roleId)) {
      setSelectedRoleIds(selectedRoleIds.filter((id) => id !== roleId));
    } else {
      setSelectedRoleIds([...selectedRoleIds, roleId]);
    }
  };

  const handleSave = async () => {
    await onSave(selectedRoleIds);
  };

  const hasChanges = () => {
    if (selectedRoleIds.length !== currentRoleIds.length) return true;
    return !selectedRoleIds.every((id) => currentRoleIds.includes(id));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assign Roles</CardTitle>
        <CardDescription>
          {userName ? `Select roles for ${userName}` : 'Select roles for this user'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {availableRoles.map((role) => (
              <div
                key={role.id}
                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <Checkbox
                  id={role.id}
                  checked={isRoleSelected(role.id)}
                  onCheckedChange={() => toggleRole(role.id)}
                  disabled={isLoading}
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    {role.icon && <span>{role.icon}</span>}
                    <Label htmlFor={role.id} className="cursor-pointer font-medium">
                      {role.name}
                    </Label>
                    {role.isSystem && (
                      <Badge variant="secondary" className="text-xs">
                        System
                      </Badge>
                    )}
                  </div>
                  {role.description && (
                    <p className="text-sm text-muted-foreground">{role.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Priority: {role.priority}</span>
                    {role.color && (
                      <>
                        <span>•</span>
                        <div
                          className="w-3 h-3 rounded-full border"
                          style={{ backgroundColor: role.color }}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="mt-4 p-3 bg-muted rounded-lg">
          <p className="text-sm font-medium">
            Selected: {selectedRoleIds.length} role(s)
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {selectedRoleIds.map((roleId) => {
              const role = availableRoles.find((r) => r.id === roleId);
              return role ? (
                <Badge key={roleId} variant="default">
                  {role.icon} {role.name}
                </Badge>
              ) : null;
            })}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        )}
        <Button onClick={handleSave} disabled={isLoading || !hasChanges()}>
          {isLoading ? 'Saving...' : 'Save Changes'}
        </Button>
      </CardFooter>
    </Card>
  );
}
