import type { NextRequest } from 'next/server';

const firstHeaderValue = (value: string | null) => {
  if (!value) {
    return '';
  }

  return value.split(',')[0].trim();
};

const getForwardedIp = (value: string | null) => {
  if (!value) {
    return '';
  }

  const forwardedFor = value
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith('for='));

  if (!forwardedFor) {
    return '';
  }

  return forwardedFor
    .slice(4)
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/^\[|\]$/g, '');
};

export const getClientIpFromHeaders = (headers: Pick<Headers, 'get'>) =>
  firstHeaderValue(headers.get('x-forwarded-for')) ||
  firstHeaderValue(headers.get('x-real-ip')) ||
  firstHeaderValue(headers.get('cf-connecting-ip')) ||
  firstHeaderValue(headers.get('true-client-ip')) ||
  getForwardedIp(headers.get('forwarded')) ||
  '無法判定';

export const getClientIp = (request: NextRequest) =>
  getClientIpFromHeaders(request.headers);
