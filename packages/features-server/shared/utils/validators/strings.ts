// 비밀번호 유효성 검사
// 규칙: 8~16자, 소문자/대문자/숫자/특수문자 각각 1개 이상 포함
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,16}$/;

export const EMAIL_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/;

// 이메일 유효성 검사
// RFC 5321/5322 준수: 로컬 부분이 .으로 시작/끝나거나 연속된 ..이 없어야 함
export const isValidEmail = (email: string): boolean => {
  return EMAIL_REGEX.test(email) && !email.includes("..");
};

export const isValidPassword = (password: string): boolean => {
  return PASSWORD_REGEX.test(password);
};
