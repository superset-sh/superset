import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@superbuilder/feature-ui/shadcn/card'
import { Separator } from '@superbuilder/feature-ui/shadcn/separator'

import Logo from 'src/components/shadcn-studio/logo'
import AuthBackgroundShape from 'src/assets/svg/auth-background-shape'
import RegisterForm from 'src/components/shadcn-studio/blocks/register-01/register-form'

const Register = () => {
  return (
    <div className='relative flex h-auto min-h-screen items-center justify-center overflow-x-hidden px-4 py-10 sm:px-6 lg:px-8'>
      <div className='absolute'>
        <AuthBackgroundShape />
      </div>

      <Card className='z-1 w-full border-none shadow-md sm:max-w-lg'>
        <CardHeader className='gap-6'>
          <Logo className='gap-3' />

          <div>
            <CardTitle className='mb-1.5 text-2xl'>Sign Up to Shadcn studio</CardTitle>
            <CardDescription className='text-base'>Ship Faster and Focus on Growth.</CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {/* Register Form */}
          <div className='space-y-4'>
            <RegisterForm />

            <p className='text-muted-foreground text-center'>
              Already have an account?{' '}
              <a href='#' className='text-card-foreground hover:underline'>
                Sign in instead
              </a>
            </p>

            <div className='flex items-center gap-4'>
              <Separator className='flex-1' />
              <p>or</p>
              <Separator className='flex-1' />
            </div>

            <Button variant='ghost' className='w-full' render={<a href='#' />} nativeButton={false}>Sign in with google</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default Register
