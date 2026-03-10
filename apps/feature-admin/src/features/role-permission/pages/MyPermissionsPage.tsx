import { Shield, Check, X } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@superbuilder/feature-ui/shadcn/card';
import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@superbuilder/feature-ui/shadcn/accordion';
import { Separator } from '@superbuilder/feature-ui/shadcn/separator';
import { useMyRoles, useMyPermissions } from '../hooks';

export function MyPermissionsPage() {
  const { data: roles, isLoading: rolesLoading } = useMyRoles();
  const { data: permissions, isLoading: permissionsLoading } = useMyPermissions();

  const permissionsByCategory = permissions?.reduce((acc, permission) => {
    const category = permission.category || 'uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(permission);
    return acc;
  }, {} as Record<string, typeof permissions>);

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">My Permissions</h1>
        </div>
        <p className="text-muted-foreground">
          View your assigned roles and permissions
        </p>
      </div>

      {/* Roles Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>My Roles</CardTitle>
          <CardDescription>
            Roles assigned to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rolesLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : roles && roles.length > 0 ? (
            <div className="space-y-3">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {role.icon && <span className="text-xl">{role.icon}</span>}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{role.name}</span>
                        {role.isSystem && (
                          <Badge variant="secondary" className="text-xs">
                            System
                          </Badge>
                        )}
                      </div>
                      {role.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {role.description}
                        </p>
                      )}
                    </div>
                  </div>
                  {role.color && (
                    <div
                      className="w-4 h-4 rounded-full border"
                      style={{ backgroundColor: role.color }}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No roles assigned
            </p>
          )}
        </CardContent>
      </Card>

      <Separator className="my-8" />

      {/* Permissions Section */}
      <Card>
        <CardHeader>
          <CardTitle>My Permissions</CardTitle>
          <CardDescription>
            All permissions granted through your roles
          </CardDescription>
        </CardHeader>
        <CardContent>
          {permissionsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : permissions && permissions.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Check className="w-5 h-5 text-green-600" />
                <span className="font-medium">
                  You have {permissions.length} permission(s)
                </span>
              </div>

              <Accordion multiple className="border rounded-lg">
                {Object.entries(permissionsByCategory || {}).map(([category, categoryPermissions]) => (
                  <AccordionItem key={category} value={category}>
                    <AccordionTrigger className="px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">
                          {category.replace('-', ' ')}
                        </span>
                        <Badge variant="secondary">
                          {categoryPermissions.length}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="px-4 pb-4 space-y-2">
                        {categoryPermissions.map((permission) => (
                          <div
                            key={permission.id}
                            className="flex items-start gap-3 p-3 bg-accent/50 rounded-lg"
                          >
                            <Check className="w-4 h-4 text-green-600 mt-0.5" />
                            <div className="flex-1">
                              <code className="text-sm font-mono">
                                {permission.resource}.{permission.action}
                                {permission.scope && `.${permission.scope}`}
                              </code>
                              {permission.description && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {permission.description}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ) : (
            <div className="text-center py-8">
              <X className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                No permissions assigned
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
