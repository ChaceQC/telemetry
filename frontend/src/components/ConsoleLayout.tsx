import { Activity, Bell, Boxes, Gauge, LayoutDashboard, LogIn, LogOut, Search, Settings } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { appConfig } from '../api/config';
import { useAuth } from '../features/auth/useAuth';

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
  const auth = useAuth();
  const accountLabel = auth.user?.display_name || auth.user?.username || (auth.isAuthenticated ? '会话待确认' : '未登录');

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

        <div className="sidebar-account" aria-label="认证状态">
          <div>
            <span>当前账号</span>
            <strong>{auth.isRestoring ? '恢复中' : accountLabel}</strong>
          </div>
          {auth.isAuthenticated ? (
            <button className="icon-button" type="button" onClick={auth.logout} title="退出登录">
              <LogOut size={17} aria-hidden="true" />
            </button>
          ) : (
            <Link className="icon-button" to="/login" title="登录">
              <LogIn size={17} aria-hidden="true" />
            </Link>
          )}
          {auth.sessionErrorMessage ? (
            <p className="sidebar-account-message" role="status">
              {auth.sessionErrorMessage}
            </p>
          ) : null}
        </div>
      </aside>

      <main className="workspace">
        <Outlet />
      </main>
    </div>
  );
}
