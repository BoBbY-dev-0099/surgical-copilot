import { Link } from 'react-router-dom';
import { Stethoscope, Users, Heart, Home } from 'lucide-react';

export default function AppLayout({ children, userRole = 'doctor' }) {
    return (
        <div className="app-layout">
            {/* Sidebar */}
            <aside className="app-sidebar">
                <Link to="/" className="sidebar-brand">
                    <div className="sidebar-logo">
                        <Stethoscope size={24} />
                    </div>
                    <span className="sidebar-brand-text">SurgicalCopilot</span>
                </Link>

                <nav className="sidebar-nav">
                    <Link to="/" className="sidebar-link">
                        <Home size={20} />
                        <span>Home</span>
                    </Link>
                </nav>

                {/* Role indicator at bottom */}
                <div className="sidebar-footer">
                    <div className="sidebar-role">
                        {userRole === 'doctor' ? (
                            <>
                                <Users size={16} />
                                <span>Dr. Vasquez</span>
                            </>
                        ) : (
                            <>
                                <Heart size={16} />
                                <span>Patient Portal</span>
                            </>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <div className="app-main">
                <main className="app-content">
                    {children}
                </main>
            </div>
        </div>
    );
}
