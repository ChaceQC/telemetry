import { createBrowserRouter } from 'react-router-dom';
import { appConfig } from '../api/config';
import { ConsoleLayout } from '../components/ConsoleLayout';
import { LoginPage } from '../pages/LoginPage';
import { OverviewPage } from '../pages/OverviewPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { QueryPage } from '../pages/QueryPage';
import { SettingsPage } from '../pages/SettingsPage';
import { TraceTopologyPage } from '../pages/TraceTopologyPage';

export const routes = [
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    path: '/',
    element: <ConsoleLayout />,
    children: [
      {
        index: true,
        element: <OverviewPage />
      },
      {
        path: 'metrics',
        element: <QueryPage signal="metrics" />
      },
      {
        path: 'logs',
        element: <QueryPage signal="logs" />
      },
      {
        path: 'traces/topology',
        element: <TraceTopologyPage />
      },
      {
        path: 'traces',
        element: <QueryPage signal="traces" />
      },
      {
        path: 'events',
        element: <QueryPage signal="events" />
      },
      {
        path: 'alerts',
        element: <PlaceholderPage title="告警规则" description="后续接入阈值规则、静默策略和通知渠道。" />
      },
      {
        path: 'settings',
        element: <SettingsPage />
      }
    ]
  }
];

export const router = createBrowserRouter(routes, {
  basename: appConfig.routerBasename
});
