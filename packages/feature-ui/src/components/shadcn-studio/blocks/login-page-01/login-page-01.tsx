import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@superbuilder/feature-ui/shadcn/card'
import { Separator } from '@superbuilder/feature-ui/shadcn/separator'

import Logo from 'src/components/shadcn-studio/logo'
import AuthBackgroundShape from 'src/assets/svg/auth-background-shape'
import LoginForm from 'src/components/shadcn-studio/blocks/login-page-01/login-form'

const Login = () => {
  return (
    <div className='relative flex h-auto min-h-screen items-center justify-center overflow-x-hidden px-4 py-10 sm:px-6 lg:px-8'>
      <div className='absolute'>
        <AuthBackgroundShape />
      </div>

      <Card className='z-1 w-full border-none shadow-md sm:max-w-lg'>
        <CardHeader className='gap-6'>
          <Logo className='gap-3' />

          <div>
            <CardTitle className='mb-1.5 text-2xl'>Sign in to Shadcn Studio</CardTitle>
            <CardDescription className='text-base'>Ship Faster and Focus on Growth.</CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <p className='text-muted-foreground mb-6'>
            Login with{' '}
            <a href='#' className='text-card-foreground hover:underline'>
              Magic Link
            </a>
          </p>

          {/* Quick Login Buttons */}
          <div className='mb-6 flex flex-wrap gap-4 sm:gap-6'>
            <Button variant='outline' className='grow'>
              Login as User
            </Button>
            <Button variant='outline' className='grow'>
              Login as Admin
            </Button>
          </div>

          {/* Login Form */}
          <div className='space-y-4'>
            <LoginForm />

            <p className='text-muted-foreground text-center'>
              New on our platform?{' '}
              <a href='#' className='text-card-foreground hover:underline'>
                Create an account
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

export default Login
