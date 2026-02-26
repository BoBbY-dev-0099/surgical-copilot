import { Link, useLocation } from 'react-router-dom';
import { Stethoscope } from 'lucide-react';

export default function GlobalHeader() {
    const { pathname } = useLocation();

    return (
        <header className="global-header">
            <Link to="/" className="gh-brand">
                <Stethoscope size={22} className="gh-logo" />
                <span className="gh-name">SurgicalCopilot</span>
            </Link>
            <nav className="gh-nav">
                <Link to="/agent" className={pathname === '/agent' ? 'active' : ''}>Agent</Link>
                <Link to="/doctor" className={pathname.startsWith('/doctor') ? 'active' : ''}>Monitor</Link>
                <Link to="/patient" className={pathname.startsWith('/patient') ? 'active' : ''}>Check-in</Link>
            </nav>
        </header>
    );
}
