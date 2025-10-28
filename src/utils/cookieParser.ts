export const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
  if (!cookieHeader) return {};
  
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...valueParts] = cookie.trim().split('=');
    const value = valueParts.join('='); // In case the value contains '='
    if (name && value) {
      cookies[name.trim()] = decodeURIComponent(value);
    }
  });
  return cookies;
};
