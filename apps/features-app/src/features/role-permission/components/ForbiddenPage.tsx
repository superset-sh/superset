import { useNavigate } from '@tanstack/react-router';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@superbuilder/feature-ui/shadcn/card';
import { ShieldX, Home, ArrowLeft } from 'lucide-react';

interface ForbiddenPageProps {
  title?: string;
  message?: string;
  requiredPermission?: string;
  showBackButton?: boolean;
  showHomeButton?: boolean;
}

export function ForbiddenPage({
  title = 'Access Denied',
  message = "You don't have permission to access this page.",
  requiredPermission,
  showBackButton = true,
  showHomeButton = true,
}: ForbiddenPageProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-destructive/10 rounded-full">
              <ShieldX className="w-12 h-12 text-destructive" />
            </div>
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription className="text-base">{message}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {requiredPermission && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-1">Required Permission:</p>
              <code className="text-xs bg-background px-2 py-1 rounded border">
                {requiredPermission}
              </code>
            </div>
          )}

          <div className="text-sm text-muted-foreground space-y-2">
            <p>This might happen because:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Your account doesn't have the required permissions</li>
              <li>Your role was recently changed</li>
              <li>This feature requires elevated access</li>
            </ul>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>
              If you believe this is an error, please contact your administrator or{' '}
              <a href="/support" className="text-primary hover:underline">
                support team
              </a>
              .
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex gap-2">
          {showBackButton && (
            <Button variant="outline" onClick={() => window.history.back()} className="flex-1">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          )}
          {showHomeButton && (
            <Button onClick={() => navigate({ to: '/' })} className="flex-1">
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
