import { test as base, expect } from '@playwright/test';
import type { Route } from '@playwright/test';

export interface MockApi {
  requests: string[];
  handle?: (route: Route, path: string) => Promise<boolean>;
}

const localOrigin = 'http://127.0.0.1:4173';
const fontStylesheet = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap';
// Closed asset fixtures, never a CDN allowlist: every response is fulfilled locally.
const assetMocks = new Map([
  [fontStylesheet, { contentType: 'text/css', body: '' }],
  ...['gb', 'es', 'fr', 'de', 'it', 'pt', 'ru'].map((code) => [
    `https://cdn.jsdelivr.net/gh/hampusborgos/country-flags@main/svg/${code}.svg`,
    { contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="16"><path fill="#777" d="M0 0h22v16H0z"/></svg>' },
  ] as const),
]);

export const test = base.extend<{ mockApi: MockApi }>({
  mockApi: async ({ baseURL }, use) => {
    expect(baseURL, 'Browser tests must use the isolated preview origin').toBe(localOrigin);
    await use({ requests: [] });
  },
  context: async ({ context, mockApi }, use) => {
    const unexpectedRequests: string[] = [];
    const browserErrors: string[] = [];
    context.on('weberror', (error) => browserErrors.push(error.error().message));
    // Redirect requests may bypass route handlers; still record them as failures.
    // The dead external proxy prevents any such redirect from reaching a service.
    context.on('request', (request) => {
      if (new URL(request.url()).origin !== localOrigin && !assetMocks.has(request.url())) {
        unexpectedRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    // Context routing covers every page/popup and is installed before page creation.
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      // Mock APIs never fall through to Vite, including unhandled GETs. External
      // URLs cannot reach this dispatcher and retain the default-deny policy.
      if (url.origin === localOrigin && (url.pathname === '/__mock-supabase' || url.pathname.startsWith('/__mock-supabase/'))) {
        const path = url.pathname.slice('/__mock-supabase'.length);
        mockApi.requests.push(`${request.method()} ${path}${url.search}`);
        if (!await mockApi.handle?.(route, path)) {
          unexpectedRequests.push(`${request.method()} ${request.url()}`);
          await route.abort('blockedbyclient');
        }
      } else if (url.origin === localOrigin && ['GET', 'HEAD'].includes(request.method())) {
        await route.continue();
      } else if (assetMocks.has(request.url()) && request.method() === 'GET') {
        await route.fulfill({ status: 200, ...assetMocks.get(request.url())! });
      } else {
        unexpectedRequests.push(`${request.method()} ${request.url()}`);
        await route.abort('blockedbyclient');
      }
    });
    await context.routeWebSocket('**/*', (socket) => {
      unexpectedRequests.push(`WebSocket ${socket.url()}`);
      // Never call connectToServer: even loopback sockets require an explicit mock.
      socket.close();
    });

    try {
      await use(context);
    } finally {
      await context.close();
      expect.soft(unexpectedRequests, 'Unexpected network requests').toEqual([]);
      expect.soft(browserErrors, 'Uncaught browser errors').toEqual([]);
    }
  },
});

export { expect };
