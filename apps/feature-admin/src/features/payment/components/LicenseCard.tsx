import { Card, CardHeader, CardTitle, CardContent } from '@superbuilder/feature-ui/shadcn/card';
import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import type { License } from '@superbuilder/drizzle';

interface LicenseCardProps {
  license: License;
}

export function LicenseCard({ license }: LicenseCardProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(license.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'success' | 'warning' | 'destructive'> = {
      active: 'success',
      inactive: 'default',
      expired: 'destructive',
      disabled: 'destructive',
    };

    return <Badge variant={variants[status] || 'default'}>{license.statusFormatted}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">License Key</CardTitle>
        {getStatusBadge(license.status)}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono truncate">
            {license.key}
          </code>
          <Button size="icon" variant="outline" onClick={copyToClipboard}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Activations:</span>
            <span className="ml-2 font-medium">
              {license.activationUsage} / {license.activationLimit}
            </span>
          </div>
          {license.expiresAt && (
            <div>
              <span className="text-muted-foreground">Expires:</span>
              <span className="ml-2">{new Date(license.expiresAt).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
