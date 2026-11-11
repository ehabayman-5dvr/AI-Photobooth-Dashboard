'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserRole } from '@/types';
import { AuthProvider, useAuth } from '@/components/AuthContext';

export default function ClientRootLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <LayoutContent>{children}</LayoutContent>
        </AuthProvider>
    );
}

function getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

function LayoutContent({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated, logout, loading } = useAuth();
    // Separate desktop rail state (default true = 88px rail) and mobile dropdown state (default false)
    const [navMini, setNavMini] = useState(true);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isMobileViewport, setIsMobileViewport] = useState(false);

    // Profile popover / logout menu state
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
    const meBtnRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    // Interactive cursor glow ref (updates CSS vars directly without React re-renders)
    const groundRef = useRef<HTMLDivElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);
    const lastPosRef = useRef<{ x: number; y: number }>({ x: 1100, y: 140 });

    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        const mql = window.matchMedia('(max-width: 900px)');
        const updateViewport = () => setIsMobileViewport(mql.matches);
        updateViewport();
        mql.addEventListener('change', updateViewport);
        return () => mql.removeEventListener('change', updateViewport);
    }, []);

    useEffect(() => {
        setMobileOpen(false);
        setProfileMenuOpen(false);
    }, [pathname]);

    const updateProfileMenuPosition = useCallback(() => {
        const btn = meBtnRef.current;
        if (!btn) return;
        const rect = btn.getBoundingClientRect();

        if (isMobileViewport) {
            const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 32);
            setMenuStyle({
                position: 'fixed',
                left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
                top: rect.bottom + 8,
                width,
            });
        } else if (navMini) {
            setMenuStyle({
                position: 'fixed',
                left: rect.right + 14,
                bottom: Math.max(16, window.innerHeight - rect.bottom),
                minWidth: 228,
            });
        } else {
            setMenuStyle({
                position: 'fixed',
                left: rect.left,
                bottom: Math.max(16, window.innerHeight - rect.top + 8),
                width: Math.max(rect.width, 216),
            });
        }
    }, [isMobileViewport, navMini]);

    useEffect(() => {
        if (!profileMenuOpen) return;
        updateProfileMenuPosition();

        const handleOutsideClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                meBtnRef.current?.contains(target) ||
                menuRef.current?.contains(target)
            ) {
                return;
            }
            setProfileMenuOpen(false);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setProfileMenuOpen(false);
                meBtnRef.current?.focus();
            }
        };

        window.addEventListener('mousedown', handleOutsideClick);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', updateProfileMenuPosition);
        window.addEventListener('scroll', updateProfileMenuPosition, true);

        return () => {
            window.removeEventListener('mousedown', handleOutsideClick);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', updateProfileMenuPosition);
            window.removeEventListener('scroll', updateProfileMenuPosition, true);
        };
    }, [profileMenuOpen, updateProfileMenuPosition]);

    useEffect(() => {
        if (!loading && !isAuthenticated && pathname !== '/login') {
            router.replace('/login');
        }
    }, [loading, isAuthenticated, pathname, router]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.round(e.clientX - rect.left);
        const y = Math.round(e.clientY - rect.top);
        const now = Date.now();
        if (
            rafRef.current !== null ||
            now - lastTimeRef.current < 60 ||
            Math.abs(x - lastPosRef.current.x) + Math.abs(y - lastPosRef.current.y) < 24
        ) {
            return;
        }
        lastTimeRef.current = now;
        lastPosRef.current = { x, y };
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            if (groundRef.current) {
                groundRef.current.style.setProperty('--glow-x', `${x}px`);
                groundRef.current.style.setProperty('--glow-y', `${y}px`);
            }
        });
    }, []);

    const toggleNav = () => {
        const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
        setIsMobileViewport(isMobile);
        if (isMobile) {
            setMobileOpen(prev => !prev);
        } else {
            setNavMini(prev => !prev);
        }
        setProfileMenuOpen(false);
    };

    if (loading) {
        return (
            <div
                className="ground"
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 24,
                }}
            >
                <div
                    className="card emerge"
                    style={{
                        maxWidth: 360,
                        width: '100%',
                        alignItems: 'center',
                        textAlign: 'center',
                        padding: '40px 32px',
                    }}
                >
                    <img
                        src="/5dvr-logo.png"
                        alt="5dVR"
                        width={44}
                        height={44}
                        style={{ width: 44, height: 44, display: 'block' }}
                    />
                    <span className="lbl">AI Photobooth</span>
                    <span style={{ fontSize: 14, color: '#5C5C66' }}>Loading workspace…</span>
                </div>
            </div>
        );
    }

    if (pathname === '/login') {
        return <>{children}</>;
    }

    if (!isAuthenticated) return null;

    if (!user) {
        return (
            <div
                className="ground"
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 24,
                }}
            >
                <div
                    className="card emerge"
                    style={{
                        maxWidth: 440,
                        width: '100%',
                        padding: '40px 36px',
                        gap: 20,
                    }}
                >
                    <div className="brand">
                        <img
                            src="/5dvr-logo.png"
                            alt="5dVR"
                            width={40}
                            height={40}
                            style={{ width: 40, height: 40, display: 'block', flex: 'none' }}
                        />
                        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.2em', textTransform: 'uppercase' }}>
                            AI Photobooth
                        </span>
                    </div>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Access verification</h2>
                    <p style={{ margin: 0, fontSize: 14, color: '#5C5C66', lineHeight: 1.5 }}>
                        We found your Google account, but couldn&apos;t verify your dashboard access. Ask an admin to invite your email, or retry the connection.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="btn btn-pink"
                        >
                            Retry connection
                        </button>
                        <button
                            type="button"
                            onClick={logout}
                            className="btn"
                        >
                            Sign in with another account
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const isAdmin = user.role === UserRole.ADMIN;
    const roleLabel = isAdmin ? 'Super admin' : 'Regular user';
    const userInitials = getInitials(user.name || user.email);

    // Build sidebar class based on viewport and state
    const sideClass = isMobileViewport
        ? `side${mobileOpen ? ' open' : ''}`
        : `side${navMini ? ' mini' : ' open'}`;

    const navLabel = isMobileViewport
        ? mobileOpen
            ? 'Close menu'
            : 'Open menu'
        : navMini
            ? 'Expand menu'
            : 'Collapse menu';

    const navExpanded = isMobileViewport ? mobileOpen : !navMini;

    const isOverviewActive = pathname === '/';
    const isProjectsActive = pathname.startsWith('/projects');
    const isUsersActive = pathname.startsWith('/users');
    const isSettingsActive = pathname.startsWith('/settings');

    return (
        <div
            ref={groundRef}
            className="ground"
            onMouseMove={handleMouseMove}
            style={
                {
                    '--glow-x': '1100px',
                    '--glow-y': '140px',
                    backgroundImage:
                        'radial-gradient(392px circle at var(--glow-x) var(--glow-y), rgba(255,0,102,.17), rgba(255,0,102,0) 70%), radial-gradient(circle at 1px 1px, rgba(5,5,7,.07) 1px, transparent 0)',
                    backgroundSize: 'auto, 24px 24px',
                    minHeight: '100vh',
                    display: 'flex',
                    flexWrap: 'wrap',
                    color: '#050507',
                } as React.CSSProperties
            }
        >
            <aside className={sideClass}>
                <div className="brandwrap">
                    <Link
                        className="brand"
                        href="/"
                        aria-label="AI Photobooth, go to Overview"
                    >
                        <img
                            src="/5dvr-logo.png"
                            alt="5dVR"
                            width={40}
                            height={40}
                            style={{ width: 40, height: 40, display: 'block', flex: 'none' }}
                        />
                        <span className="brand-title">
                            AI Photobooth
                        </span>
                    </Link>
                    <button
                        className="hamb"
                        type="button"
                        aria-label={navLabel}
                        aria-expanded={navExpanded}
                        onClick={toggleNav}
                    >
                        <span aria-hidden="true"></span>
                        <span aria-hidden="true"></span>
                        <span aria-hidden="true"></span>
                    </button>
                </div>

                <nav className="sidenav" aria-label="Main">
                    <Link
                        className={`nav${isOverviewActive ? ' on' : ''}`}
                        href="/"
                        title="Overview"
                        aria-current={isOverviewActive ? 'page' : undefined}
                    >
                        <svg
                            aria-hidden="true"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                        >
                            <rect x="4" y="4" width="7" height="7" rx="1"></rect>
                            <rect x="13" y="4" width="7" height="7" rx="1"></rect>
                            <rect x="4" y="13" width="7" height="7" rx="1"></rect>
                            <rect x="13" y="13" width="7" height="7" rx="1"></rect>
                        </svg>
                        Overview
                    </Link>

                    <Link
                        className={`nav${isProjectsActive ? ' on' : ''}`}
                        href="/projects"
                        title="Projects"
                        aria-current={isProjectsActive ? 'page' : undefined}
                    >
                        <svg
                            aria-hidden="true"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                        >
                            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        </svg>
                        Projects
                    </Link>

                    {isAdmin && (
                        <>
                            <Link
                                className={`nav${isUsersActive ? ' on' : ''}`}
                                href="/users"
                                title="People & access"
                                aria-current={isUsersActive ? 'page' : undefined}
                            >
                                <svg
                                    aria-hidden="true"
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                >
                                    <circle cx="9" cy="8" r="3.5"></circle>
                                    <path d="M3 20a6 6 0 0 1 12 0"></path>
                                    <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 20a6 6 0 0 0-3-5.2"></path>
                                </svg>
                                People &amp; access
                            </Link>

                            <Link
                                className={`nav${isSettingsActive ? ' on' : ''}`}
                                href="/settings"
                                title="Settings"
                                aria-current={isSettingsActive ? 'page' : undefined}
                            >
                                <svg
                                    aria-hidden="true"
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                                Settings
                            </Link>
                        </>
                    )}
                </nav>

                <div className="sidefoot">
                    <button
                        ref={meBtnRef}
                        type="button"
                        className="me"
                        title={`${user.name} · ${roleLabel}`}
                        aria-haspopup="menu"
                        aria-expanded={profileMenuOpen}
                        onClick={() => {
                            if (!profileMenuOpen) updateProfileMenuPosition();
                            setProfileMenuOpen(prev => !prev);
                        }}
                    >
                        <span className="me-av" aria-hidden="true">
                            {userInitials}
                        </span>
                        <span className="me-txt">
                            <span className="me-name">{user.name}</span>
                            <span className="me-role">{roleLabel}</span>
                        </span>
                        <svg
                            className="me-chev"
                            aria-hidden="true"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#5C5C66"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                                flex: 'none',
                                transform: profileMenuOpen ? 'rotate(180deg)' : 'none',
                                transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                            }}
                        >
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                </div>

                {profileMenuOpen &&
                    typeof document !== 'undefined' &&
                    createPortal(
                        <div
                            ref={menuRef}
                            className="me-menu"
                            role="menu"
                            aria-label="Account menu"
                            style={menuStyle}
                        >
                            <div className="me-menu-head">
                                <span
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 700,
                                        color: '#050507',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}
                                >
                                    {user.name}
                                </span>
                                <span
                                    style={{
                                        fontSize: 11,
                                        color: '#5C5C66',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}
                                >
                                    {user.email}
                                </span>
                                <span
                                    className="lbl"
                                    style={{
                                        marginTop: 4,
                                        fontSize: 9,
                                        letterSpacing: '.2em',
                                        color: isAdmin ? '#FF0066' : '#5C5C66',
                                    }}
                                >
                                    {roleLabel}
                                </span>
                            </div>
                            <button
                                type="button"
                                role="menuitem"
                                className="me-logout"
                                disabled={isLoggingOut}
                                onClick={async () => {
                                    setIsLoggingOut(true);
                                    await logout();
                                }}
                            >
                                <svg
                                    aria-hidden="true"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                    <polyline points="16 17 21 12 16 7"></polyline>
                                    <line x1="21" y1="12" x2="9" y2="12"></line>
                                </svg>
                                {isLoggingOut ? 'Logging out…' : 'Log out'}
                            </button>
                        </div>,
                        document.body
                    )}
            </aside>

            <main
                className="app-main"
                style={{
                    flex: '999 1 560px',
                    minWidth: 0,
                    boxSizing: 'border-box',
                    padding: '48px clamp(20px, 5vw, 80px) 80px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 40,
                }}
            >
                {children}

                <footer
                    style={{
                        marginTop: 'auto',
                        paddingTop: 48,
                        display: 'flex',
                        justifyContent: 'center',
                    }}
                >
                    <a
                        className="powered"
                        href="https://5d-vr.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Powered by 5dVR (opens 5d-vr.com in a new tab)"
                    >
                        <span className="lbl" style={{ fontSize: 10, letterSpacing: '.28em' }}>
                            Powered by
                        </span>
                        <img
                            src="/5dvr-logo.png"
                            alt="5dVR"
                            width={32}
                            height={32}
                            style={{ width: 32, height: 32, display: 'block' }}
                        />
                        <svg
                            className="ext"
                            aria-hidden="true"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M7 17L17 7M9 7h8v8"></path>
                        </svg>
                    </a>
                </footer>
            </main>
        </div>
    );
}
