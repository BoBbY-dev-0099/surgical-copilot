import { BrowserRouter, Routes, Route, useLocation, Outlet } from 'react-router-dom';
import { Component } from 'react';
import { NoticeProvider } from './context/NoticeContext';
import Landing from './pages/Landing';
import DoctorPortal from './pages/DoctorPortal';
import PatientPortal from './pages/PatientPortal';
import DemoShowcase from './pages/DemoShowcase';
import ClinicalAgentPage from './pages/ClinicalAgentPage';
import GlobalHeader from './components/GlobalHeader';
import AppLayout from './components/AppLayout';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'system-ui', maxWidth: 700, margin: '40px auto' }}>
          <h2 style={{ color: '#DC2626' }}>Something went wrong</h2>
          <pre style={{ background: '#FEE2E2', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 13 }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <pre style={{ background: '#F1F5F9', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 11, marginTop: 8, maxHeight: 300 }}>
            {this.state.error?.stack}
          </pre>
          <button onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{ marginTop: 16, padding: '8px 20px', background: '#0F172A', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function DashboardLayout() {
  const location = useLocation();
  const userRole = location.pathname.startsWith('/doctor') ? 'doctor' : 'patient';
  return (
    <AppLayout userRole={userRole}>
      <Outlet />
    </AppLayout>
  );
}

function StandardLayout() {
  return (
    <div className="app-container">
      <GlobalHeader />
      <Outlet />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <NoticeProvider>
          <Routes>
            {/* Standard pages with header */}
            <Route element={<StandardLayout />}>
              <Route path="/" element={<Landing />} />
              <Route path="/demo" element={<DemoShowcase />} />
              <Route path="/agent" element={<ErrorBoundary><ClinicalAgentPage /></ErrorBoundary>} />
            </Route>
            
            {/* Dashboard pages with sidebar */}
            <Route element={<DashboardLayout />}>
              <Route path="/doctor" element={<ErrorBoundary><DoctorPortal /></ErrorBoundary>} />
              <Route path="/doctor/patient/:id" element={<ErrorBoundary><DoctorPortal /></ErrorBoundary>} />
              <Route path="/patient" element={<ErrorBoundary><PatientPortal /></ErrorBoundary>} />
              <Route path="/patient/:id" element={<ErrorBoundary><PatientPortal /></ErrorBoundary>} />
            </Route>
          </Routes>
        </NoticeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
