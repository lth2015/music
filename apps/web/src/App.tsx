import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading } from './components/common';
import { PlayerProvider } from './lib/player';
import { SessionProvider, useSession } from './lib/session';
import Account from './pages/Account';
import Admin from './pages/Admin';
import Auth from './pages/Auth';
import Billing from './pages/Billing';
import { CheckoutComplete, CheckoutConfirm, CheckoutSimulate } from './pages/Checkout';
import Create from './pages/Create';
import Export from './pages/Export';
import Home from './pages/Home';
import { Privacy, Terms, Tokushoho } from './pages/Legal';
import Library from './pages/Library';
import Pricing from './pages/Pricing';
import Project from './pages/Project';
import Rights from './pages/Rights';

/** Sends unauthenticated visitors to sign-in, preserving where they were going. */
function RequireAuth({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { me, loading } = useSession();
  const location = useLocation();

  if (loading) return <Loading />;
  if (!me) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }
  if (roles && !roles.includes(me.role)) {
    return (
      <div className="alert alert--error">
        <div className="alert__title">この画面を表示する権限がありません</div>
        <div className="small">管理者にお問い合わせください。</div>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <PlayerProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/pricing" element={<Pricing />} />

              <Route
                path="/create"
                element={
                  <RequireAuth>
                    <Create />
                  </RequireAuth>
                }
              />
              <Route
                path="/projects/:id"
                element={
                  <RequireAuth>
                    <Project />
                  </RequireAuth>
                }
              />
              <Route
                path="/tracks/:id/export"
                element={
                  <RequireAuth>
                    <Export />
                  </RequireAuth>
                }
              />
              <Route
                path="/library"
                element={
                  <RequireAuth>
                    <Library />
                  </RequireAuth>
                }
              />

              <Route
                path="/checkout/confirm"
                element={
                  <RequireAuth>
                    <CheckoutConfirm />
                  </RequireAuth>
                }
              />
              <Route
                path="/checkout/complete"
                element={
                  <RequireAuth>
                    <CheckoutComplete />
                  </RequireAuth>
                }
              />
              {/* Demo only; the page itself refuses to render outside demo mode. */}
              <Route
                path="/checkout/simulate"
                element={
                  <RequireAuth>
                    <CheckoutSimulate />
                  </RequireAuth>
                }
              />

              <Route
                path="/settings/billing"
                element={
                  <RequireAuth>
                    <Billing />
                  </RequireAuth>
                }
              />
              <Route
                path="/settings/account"
                element={
                  <RequireAuth>
                    <Account />
                  </RequireAuth>
                }
              />

              <Route
                path="/admin"
                element={
                  <RequireAuth roles={['admin', 'support']}>
                    <Admin />
                  </RequireAuth>
                }
              />

              {/* Public on purpose: a rights holder must not need an account (SEC-10). */}
              <Route path="/help/rights" element={<Rights />} />
              <Route path="/legal/terms" element={<Terms />} />
              <Route path="/legal/privacy" element={<Privacy />} />
              <Route path="/legal/tokushoho" element={<Tokushoho />} />

              <Route
                path="*"
                element={
                  <div className="empty">
                    <h2>ページが見つかりません</h2>
                    <p>URLをご確認ください。</p>
                  </div>
                }
              />
            </Routes>
          </Layout>
        </PlayerProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
