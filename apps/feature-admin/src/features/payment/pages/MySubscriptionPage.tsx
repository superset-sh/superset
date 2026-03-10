import { SubscriptionCard } from '../components';
import { LicenseCard } from '../components/LicenseCard';
import { useMySubscription, useCancelSubscription, useMyLicenses } from '../hooks';
import { Alert, AlertDescription } from '@superbuilder/feature-ui/shadcn/alert';
import { Skeleton } from '@superbuilder/feature-ui/shadcn/skeleton';
import { toast } from 'sonner';

export function MySubscriptionPage() {
  const { data: subscription, isLoading: subLoading } = useMySubscription();
  const { data: licenses, isLoading: licLoading } = useMyLicenses();
  const { cancelSubscription, isLoading: isCancelling } = useCancelSubscription();

  const handleCancel = async (id: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to cancel your subscription? You will continue to have access until the end of your billing period.',
    );

    if (!confirmed) return;

    try {
      await cancelSubscription(id);
      toast.success('Your subscription has been cancelled successfully.');
    } catch (error: any) {
      toast.error(error.message || 'Failed to cancel subscription');
    }
  };

  const handleManage = (urls: any) => {
    if (urls.customer_portal) {
      window.open(urls.customer_portal, '_blank');
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">My Subscription</h1>
        <p className="text-muted-foreground mt-2">
          Manage your subscription and license keys.
        </p>
      </div>

      <div className="space-y-8">
        {/* Subscription */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Subscription</h2>
          {subLoading ? (
            <Skeleton className="h-64" />
          ) : subscription ? (
            <SubscriptionCard
              subscription={subscription as any}
              onCancel={handleCancel}
              onManage={handleManage}
              isLoading={isCancelling}
            />
          ) : (
            <Alert>
              <AlertDescription>
                You don't have an active subscription. Visit the products page to subscribe.
              </AlertDescription>
            </Alert>
          )}
        </section>

        {/* Licenses */}
        {licenses && licenses.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">License Keys</h2>
            {licLoading ? (
              <Skeleton className="h-32" />
            ) : (
              <div className="space-y-4">
                {licenses.map((license) => (
                  <LicenseCard key={license.id} license={license as any} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
