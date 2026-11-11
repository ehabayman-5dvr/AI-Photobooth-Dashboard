'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '@/components/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const { loginWithGoogle, isAuthenticated } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    // Interactive cursor glow state
    const [glowPos, setGlowPos] = useState({ x: 1100, y: 140 });
    const rafRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);
    const lastPosRef = useRef<{ x: number; y: number }>({ x: 1100, y: 140 });

    useEffect(() => {
        if (isAuthenticated) {
            router.push('/');
        }
    }, [isAuthenticated, router]);

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
            setGlowPos({ x, y });
        });
    }, []);

    if (isAuthenticated) {
        return null;
    }

    const handleGoogleLogin = async () => {
        setLoading(true);
        try {
            await loginWithGoogle();
        } catch (error) {
            console.error(error);
            setLoading(false);
        }
    };

    return (
        <div
            className="ground"
            onMouseMove={handleMouseMove}
            style={{
                backgroundImage: `radial-gradient(392px circle at ${glowPos.x}px ${glowPos.y}px, rgba(255,0,102,.17), rgba(255,0,102,0) 70%), radial-gradient(circle at 1px 1px, rgba(5,5,7,.07) 1px, transparent 0)`,
                backgroundSize: 'auto, 24px 24px',
                minHeight: '100vh',
                boxSizing: 'border-box',
                padding: '48px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 32,
                color: '#050507',
            }}
        >
            <main
                className="glow emerge"
                style={{
                    width: '100%',
                    maxWidth: 440,
                    background: '#F7F5F2',
                    border: '1px solid #E3DFD8',
                    borderRadius: 4,
                    padding: '48px 40px',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 32,
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
                    <span
                        style={{
                            fontSize: 14,
                            fontWeight: 600,
                            letterSpacing: '.2em',
                            textTransform: 'uppercase',
                        }}
                    >
                        AI Photobooth
                    </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <h1
                        style={{
                            margin: 0,
                            fontSize: 36,
                            fontWeight: 300,
                            letterSpacing: '.04em',
                            textTransform: 'uppercase',
                            lineHeight: 1.1,
                        }}
                    >
                        Step <span style={{ fontWeight: 800, color: '#FF0066' }}>inside.</span>
                    </h1>
                    <p style={{ margin: 0, fontSize: 14, color: '#5C5C66', lineHeight: 1.5 }}>
                        Sign in with the Google account your admin invited.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="gbtn"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                            fill="currentColor"
                            d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 15.25 5 12c0-3.25 3.36-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
                        />
                    </svg>
                    {loading ? 'Connecting…' : 'Continue with Google'}
                </button>

                <div style={{ height: 1, background: '#E3DFD8' }} />

                <p style={{ margin: 0, fontSize: 13, color: '#5C5C66', lineHeight: 1.5 }}>
                    No access yet? Ask an admin to invite your email. You&apos;ll stay signed in on every tab of this browser.
                </p>
            </main>

            <footer style={{ display: 'flex', justifyContent: 'center' }}>
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
        </div>
    );
}
