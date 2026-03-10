import React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
  Hr,
} from '@react-email/components';

interface EmailLayoutProps {
  children: React.ReactNode;
}

/**
 * 공통 이메일 레이아웃
 */
export function EmailLayout({ children }: EmailLayoutProps) {
  const appUrl = process.env.APP_URL || 'https://atlas.com';

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          {/* 헤더 */}
          <Section style={header}>
            <Text style={logo}>Atlas</Text>
          </Section>

          <Hr style={divider} />

          {/* 본문 */}
          <Section style={content}>{children}</Section>

          <Hr style={divider} />

          {/* 푸터 */}
          <Section style={footer}>
            <Text style={footerText}>
              © {new Date().getFullYear()} Atlas. All rights reserved.
            </Text>
            <Text style={footerText}>
              <Link href={`${appUrl}/settings/email`} style={footerLink}>
                이메일 설정
              </Link>
              {' · '}
              <Link href={`${appUrl}/support`} style={footerLink}>
                고객 지원
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
};

const header = {
  padding: '32px 48px',
};

const logo = {
  fontSize: '28px',
  fontWeight: 'bold',
  color: '#000000',
  margin: '0',
};

const divider = {
  borderColor: '#e6ebf1',
  margin: '0',
};

const content = {
  padding: '48px',
};

const footer = {
  padding: '32px 48px',
  textAlign: 'center' as const,
};

const footerText = {
  fontSize: '12px',
  color: '#8898aa',
  lineHeight: '16px',
  margin: '4px 0',
};

const footerLink = {
  fontSize: '12px',
  color: '#6772e5',
  textDecoration: 'underline',
};
