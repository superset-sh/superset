import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@superbuilder/feature-ui/shadcn/card'

import Logo from 'src/components/shadcn-studio/logo'
import AuthBackgroundShape from 'src/assets/svg/auth-background-shape'

const VerifyEmail = () => {
  return (
    <div className='relative flex h-auto min-h-screen items-center justify-center overflow-x-hidden px-4 py-10 sm:px-6 lg:px-8'>
      <div className='absolute'>
        <AuthBackgroundShape />
      </div>

      <Card className='z-1 w-full border-none shadow-md sm:max-w-md'>
        <CardHeader className='gap-6'>
          <Logo className='gap-3' />

          <div>
            <CardTitle className='mb-1.5 text-2xl'>Verify your email</CardTitle>
            <CardDescription className='text-base'>
              An activation link has been sent to your email address: hello@example.com. Please check your inbox and
              click on the link to complete the activation process.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <div className='space-y-4'>
            <Button className='w-full' render={<a href='#' />} nativeButton={false}>Skip for now</Button>

            <p className='text-muted-foreground text-center'>
              Didn&apos;t get the mail?{' '}
              <a href='#' className='text-card-foreground hover:underline'>
                Resend
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default VerifyEmail
