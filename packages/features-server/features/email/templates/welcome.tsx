// @ts-ignore: React needed for JSX in webpack build
import React from 'react';
import { Text, Button, Heading } from '@react-email/components';
import { EmailLayout } from './layout';
import type { WelcomeEmailVariables } from '../types';

/**
 * 환영 이메일 템플릿
 */
export function WelcomeEmail({ userName, loginUrl }: WelcomeEmailVariables) {
  return (
    <EmailLayout>
      <Heading style={heading}>환영합니다, {userName}님!</Heading>

      <Text style={paragraph}>
        Atlas에 가입해주셔서 감사합니다. 이제 모든 기능을 사용하실 수 있습니다.
      </Text>

      <Text style={paragraph}>
        Atlas와 함께 더 나은 경험을 시작하세요:
      </Text>

      <Button href={loginUrl} style={button}>
        시작하기
      </Button>

      <Text style={paragraph}>
        문의사항이 있으시면 언제든지 연락주세요.
      </Text>

      <Text style={footnote}>
        이 이메일은 최근 Atlas에 가입한 계정으로 발송되었습니다.
      </Text>
    </EmailLayout>
  );
}

const heading = {
  fontSize: '24px',
  fontWeight: 'bold',
  marginBottom: '24px',
  color: '#000000',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '24px',
  marginBottom: '16px',
  color: '#525f7f',
};

const button = {
  backgroundColor: '#5469d4',
  borderRadius: '4px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 20px',
  margin: '24px 0',
};

const footnote = {
  fontSize: '12px',
  lineHeight: '16px',
  marginTop: '32px',
  color: '#8898aa',
};
