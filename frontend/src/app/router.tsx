import { createBrowserRouter } from 'react-router-dom';
import { ConsoleLayout } from '../components/ConsoleLayout';
import { OverviewPage } from '../pages/OverviewPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { SettingsPage } from '../pages/SettingsPage';

export const router = createBrowserRouter([
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
        element: <PlaceholderPage title="指标查询" description="后续接入指标筛选、聚合窗口和多序列图表。" />
      },
      {
        path: 'logs',
        element: <PlaceholderPage title="日志检索" description="后续接入关键词搜索、字段过滤和上下文查看。" />
      },
      {
        path: 'traces',
        element: <PlaceholderPage title="链路追踪" description="后续接入 trace 列表、waterfall 和 span 详情。" />
      },
      {
        path: 'events',
        element: <PlaceholderPage title="事件时间线" description="后续接入部署、配置变更、告警和故障事件。" />
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
]);
