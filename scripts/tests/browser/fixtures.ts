import { test as base, expect } from '@playwright/test';
import type { Route } from '@playwright/test';

export interface MockApi {
  requests: string[];
  handle?: (route: Route, path: string) => Promise<boolean>;
}

// Fonts and country flags are self-hosted, so the preview origin is the only
// origin a page may contact; there are no external asset mocks.
const localOrigin = 'http://127.0.0.1:4173';

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
      if (new URL(request.url()).origin !== localOrigin) {
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
