// @ts-ignore: React needed for JSX in webpack build
import React from 'react';
import { Text, Button, Heading } from '@react-email/components';
import { EmailLayout } from './layout';
import type { PasswordResetVariables } from '../types';

/**
 * 비밀번호 재설정 템플릿
 */
export function PasswordResetEmail({
  userName,
  resetUrl,
  expiresIn,
}: PasswordResetVariables) {
  return (
    <EmailLayout>
      <Heading style={heading}>비밀번호 재설정 요청</Heading>

      <Text style={paragraph}>안녕하세요, {userName}님</Text>

      <Text style={paragraph}>
        비밀번호 재설정 요청을 받았습니다. 아래 버튼을 클릭하여 새 비밀번호를 설정하세요.
      </Text>

      <Button href={resetUrl} style={button}>
        비밀번호 재설정하기
      </Button>

      <Text style={paragraph}>
        버튼이 작동하지 않으면 아래 링크를 복사하여 브라우저에 붙여넣으세요:
      </Text>

      <Text style={link}>{resetUrl}</Text>

      <Text style={warningBox}>
        <strong>보안 안내:</strong> 이 링크는 {expiresIn} 동안만 유효합니다. 비밀번호 재설정을 요청하지 않으셨다면 즉시 계정 보안을 확인하세요.
      </Text>

      <Text style={footnote}>
        비밀번호 재설정을 요청하지 않으셨다면 이 이메일을 무시하셔도 됩니다. 계정은 안전하게 보호됩니다.
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

const link = {
  fontSize: '14px',
  color: '#6772e5',
  wordBreak: 'break-all' as const,
  marginBottom: '16px',
};

const warningBox = {
  backgroundColor: '#fff3cd',
  border: '1px solid #ffc107',
  borderRadius: '4px',
  padding: '16px',
  fontSize: '14px',
  lineHeight: '20px',
  color: '#856404',
  margin: '24px 0',
};

const footnote = {
  fontSize: '12px',
  lineHeight: '16px',
  marginTop: '32px',
  color: '#8898aa',
};
