import { FormEvent, useState } from 'react';
import { LockKeyhole, LogIn, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { formatApiErrorMessage } from '../api/http';
import { useAuth } from '../features/auth/useAuth';

type LoginLocationState = {
  from?: {
    pathname?: string;
  };
};

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const locationState = location.state as LoginLocationState | null;
  const returnPath = locationState?.from?.pathname || '/';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await auth.login({
        username: username.trim(),
        password
      });
      navigate(returnPath, { replace: true });
    } catch (error) {
      setErrorMessage(formatApiErrorMessage(error, 'login'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-shell" aria-label="登录">
        <div className="login-copy">
          <Link className="login-brand" to="/">
            <span className="brand-mark" aria-hidden="true">
              T
            </span>
            <span>遥测平台</span>
          </Link>

          <div>
            <p className="eyebrow">安全登录</p>
            <h1>登录控制台</h1>
            <p className="workspace-summary">
              使用授权账号进入遥测控制台，查看服务状态、配置基础资源并继续排查关键事件。
            </p>
          </div>

          <div className="auth-boundary">
            <ShieldCheck size={20} aria-hidden="true" />
            <p>登录状态仅保留在当前浏览器会话中；在共享设备上操作完成后请及时退出。</p>
          </div>
        </div>

        <form className="login-panel" onSubmit={handleSubmit}>
          <div className="login-panel-heading">
            <div className="status-icon">
              <LockKeyhole size={22} aria-hidden="true" />
            </div>
            <div>
              <h2>账号登录</h2>
              <p>请输入账号和密码验证身份。</p>
            </div>
          </div>

          <label className="field">
            <span>账号</span>
            <input
              autoComplete="username"
              name="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入账号"
            />
          </label>

          <label className="field">
            <span>密码</span>
            <input
              autoComplete="current-password"
              name="password"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
            />
          </label>

          {errorMessage ? (
            <div className="form-error" role="alert">
              <TriangleAlert size={16} aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          <button className="primary-button" disabled={isSubmitting || !username.trim() || !password} type="submit">
            <LogIn size={16} aria-hidden="true" />
            {isSubmitting ? '登录中' : '登录'}
          </button>
        </form>
      </section>
    </main>
  );
}
