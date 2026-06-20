import { Activity, Bell, Boxes, Gauge, LayoutDashboard, Search, Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { appConfig } from '../api/config';

const navigationItems = [
  { label: '总览', to: '/', icon: LayoutDashboard },
  { label: '指标', to: '/metrics', icon: Gauge },
  { label: '日志', to: '/logs', icon: Search },
  { label: '链路', to: '/traces', icon: Activity },
  { label: '事件', to: '/events', icon: Boxes },
  { label: '告警', to: '/alerts', icon: Bell },
  { label: '设置', to: '/settings', icon: Settings }
];

export function ConsoleLayout() {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            T
          </div>
          <div>
            <strong>{appConfig.appName}</strong>
            <span>v{appConfig.appVersion}</span>
          </div>
        </div>

        <nav className="navigation">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
                title={item.label}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <main className="workspace">
        <Outlet />
      </main>
    </div>
  );
}
