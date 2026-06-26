// @vitest-environment jsdom

import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ConsoleLayout } from '../components/ConsoleLayout';
import { AuthContext } from '../features/auth/authContext';
import type { AuthContextValue } from '../features/auth/authContext';
import { routes } from './router';

const signedOutAuth: AuthContextValue = {
  user: null,
  isAuthenticated: false,
  isRestoring: false,
  canRequestAuthenticatedApi: false,
  sessionRevision: 0,
  sessionErrorMessage: null,
  login: async () => null,
  logout: () => undefined,
  refreshCurrentUser: async () => null
};

function flattenRoutePaths(routeItems: typeof routes) {
  return routeItems.flatMap((route) => [route.path, ...(route.children?.map((child) => child.path ?? '/') ?? [])]);
}

describe('router console entries', () => {
  it('保留既有查询路由并提供 dashboards/alerts 路由', () => {
    expect(flattenRoutePaths(routes)).toEqual(
      expect.arrayContaining(['/', 'metrics', 'logs', 'traces/topology', 'traces', 'events', 'dashboards', 'alerts', 'settings'])
    );
  });

  it('侧边导航包含仪表盘和告警入口且不移除既有查询入口', () => {
    const html = renderToString(
      <AuthContext.Provider value={signedOutAuth}>
        <MemoryRouter>
          <ConsoleLayout />
        </MemoryRouter>
      </AuthContext.Provider>
    );

    expect(html).toContain('href="/dashboards"');
    expect(html).toContain('仪表盘');
    expect(html).toContain('href="/alerts"');
    expect(html).toContain('告警');
    expect(html).toContain('href="/metrics"');
    expect(html).toContain('href="/logs"');
    expect(html).toContain('href="/traces"');
    expect(html).toContain('href="/events"');
  });
});
