import { ChevronLeftIcon } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@superbuilder/feature-ui/shadcn/card'

import ForgotPasswordForm from 'src/components/shadcn-studio/blocks/forgot-password-01/forgot-password-form'
import AuthBackgroundShape from 'src/assets/svg/auth-background-shape'
import Logo from 'src/components/shadcn-studio/logo'

const ForgotPassword = () => {
  return (
    <div className='relative flex h-auto min-h-screen items-center justify-center overflow-x-hidden px-4 py-10 sm:px-6 lg:px-8'>
      <div className='absolute'>
        <AuthBackgroundShape />
      </div>

      <Card className='z-1 w-full border-none shadow-md sm:max-w-md'>
        <CardHeader className='gap-6'>
          <Logo className='gap-3' />

          <div>
            <CardTitle className='mb-1.5 text-2xl'>Forgot Password?</CardTitle>
            <CardDescription className='text-base'>
              Enter your email and we&apos;ll send you instructions to reset your password
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className='space-y-4'>
          {/* ForgotPassword Form */}
          <ForgotPasswordForm />

          <a href='#' className='group mx-auto flex w-fit items-center gap-2'>
            <ChevronLeftIcon className='size-5 transition-transform duration-200 group-hover:-translate-x-0.5' />
            <span>Back to login</span>
          </a>
        </CardContent>
      </Card>
    </div>
  )
}

export default ForgotPassword
