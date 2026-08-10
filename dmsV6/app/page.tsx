import { App } from '../App';

const externalLoginErrorMessages: Record<string, string> = {
  invalid_credentials: '帳號或密碼錯誤。',
  missing_credentials: '請輸入帳號與密碼。',
  server_error: '伺服器處理失敗，請稍後再試。'
};

interface HomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const errorCodeValue = params.external_login_error;
  const errorCode = Array.isArray(errorCodeValue) ? errorCodeValue[0] : errorCodeValue;

  return <App initialLoginError={errorCode ? externalLoginErrorMessages[errorCode] || '' : ''} />;
}
