export function simplifyUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    let path = parsed.pathname;

    // Remove semicolon parameters
    path = path.replace(/;[^/]*/g, '');

    // Remove UUID-like segments (32+ hex chars)
    const segments = path.split('/').filter(seg => !/^[0-9a-fA-F]{32,}$/.test(seg));
    path = segments.join('/') || '/';

    return path + (parsed.search || '');
  } catch {
    return rawUrl;
  }
}
