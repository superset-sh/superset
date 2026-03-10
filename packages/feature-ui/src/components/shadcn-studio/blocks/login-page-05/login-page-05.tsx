import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@superbuilder/feature-ui/shadcn/card'
import { Separator } from '@superbuilder/feature-ui/shadcn/separator'

import Logo from 'src/components/shadcn-studio/logo'
import AuthLines from 'src/assets/svg/auth-lines'
import LoginForm from 'src/components/shadcn-studio/blocks/login-page-05/login-form'

const Login = () => {
  return (
    <div className='bg-muted flex h-auto min-h-screen items-center justify-center px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-24'>
      <Card className='relative w-full max-w-md overflow-hidden border-none pt-12 shadow-lg'>
        <div className='to-primary/10 pointer-events-none absolute top-0 h-52 w-full rounded-t-xl bg-gradient-to-t from-transparent'></div>

        <AuthLines className='pointer-events-none absolute inset-x-0 top-0' />

        <CardHeader className='justify-center gap-6 text-center'>
          <Logo className='justify-center gap-3' />

          <div>
            <CardTitle className='mb-1.5 text-2xl'>Welcome Back</CardTitle>
            <CardDescription className='text-base'>Please enter your details to sign in</CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <div className='mb-6 flex items-center gap-2.5'>
            <Button variant='outline' className='grow' render={<a href='#' />} nativeButton={false}><img
                                        src='https://cdn.shadcnstudio.com/ss-assets/brand-logo/google-icon.png'
                                        alt='google icon'
                                        className='size-5'
                                      /></Button>
            <Button variant='outline' className='grow' render={<a href='#' />} nativeButton={false}><img
                                        src='https://cdn.shadcnstudio.com/ss-assets/brand-logo/facebook-icon.png'
                                        alt='facebook icon'
                                        className='size-5'
                                      /></Button>
            <Button variant='outline' className='grow' render={<a href='#' />} nativeButton={false}><img
                                        src='https://cdn.shadcnstudio.com/ss-assets/brand-logo/github-icon.png'
                                        alt='github icon'
                                        className='size-5 dark:invert'
                                      /></Button>
          </div>

          <div className='mb-6 flex items-center gap-4'>
            <Separator className='flex-1' />
            <p>or</p>
            <Separator className='flex-1' />
          </div>

          <LoginForm />

          <p className='text-muted-foreground mt-4 text-center'>
            New on our platform?{' '}
            <a href='#' className='text-card-foreground hover:underline'>
              Create an account
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default Login
