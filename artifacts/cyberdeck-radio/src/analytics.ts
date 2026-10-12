const GA_ID = (import.meta.env.VITE_GA_ID as string | undefined) ?? '';

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

function push(...args: unknown[]): void {
  window.dataLayer?.push(args);
}

export function initAnalytics(): void {
  if (!GA_ID) return;
  if (document.getElementById('gtag-analytics')) return;

  window.dataLayer = window.dataLayer ?? [];

  const script = document.createElement('script');
  script.id = 'gtag-analytics';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);

  window.gtag = (...args: unknown[]) => push(...args);
  push('js', new Date());
  push('config', GA_ID, { anonymize_ip: true });
}