
'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AuthState, UserRole } from '@/types';
import { supabase } from '@/utils/supabase';
import { Session } from '@supabase/supabase-js';

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
    loading: boolean;
    session: Session | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    const isResolving = React.useRef(false);
    const loadedUserIdRef = React.useRef<string | null>(null);
    const inFlightProfileRef = React.useRef<{ userId: string; promise: Promise<void> } | null>(null);

    const fetchUserProfile = React.useCallback(async (activeSession: Session, force = false) => {
        const userId = activeSession.user.id;

        if (!force && loadedUserIdRef.current === userId) {
            setLoading(false);
            return;
        }

        if (inFlightProfileRef.current?.userId === userId) {
            return inFlightProfileRef.current.promise;
        }

        const run = (async () => {
            try {
                const fetchPromise = supabase
                    .from('profiles')
                    .select('id, full_name, email, role')
                    .eq('id', userId)
                    .single();

                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Profile fetch timed out')), 4000)
                );

                const { data } = (await Promise.race([fetchPromise, timeoutPromise])) as {
                    data?: { id: string; full_name?: string | null; email: string; role?: string | null } | null;
                };

                if (data) {
                    const nextRole = (data.role as UserRole) || UserRole.REGULAR;
                    const nextName = data.full_name || 'Admin User';
                    loadedUserIdRef.current = data.id;
                    setUser(prev => {
                        if (
                            prev &&
                            prev.id === data.id &&
                            prev.name === nextName &&
                            prev.email === data.email &&
                            prev.role === nextRole
                        ) {
                            return prev;
                        }
                        return {
                            id: data.id,
                            name: nextName,
                            email: data.email,
                            role: nextRole,
                            assignedProjectIds: prev?.assignedProjectIds || [],
                        };
                    });
                } else {
                    loadedUserIdRef.current = null;
                    setUser(null);
                }
            } catch (error) {
                console.error('❌ Auth: Profile fetch failed:', error);
            } finally {
                if (inFlightProfileRef.current?.userId === userId) {
                    inFlightProfileRef.current = null;
                }
                setLoading(false);
            }
        })();

        inFlightProfileRef.current = { userId, promise: run };
        return run;
    }, []);

    useEffect(() => {
        let mounted = true;

        const initializeAuth = async (isRetry = false) => {
            if (isResolving.current && !isRetry) return;
            isResolving.current = true;

            try {
                const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();

                if (sessionError) throw sessionError;
                if (!mounted) return;

                setSession(prev => (prev?.access_token === currentSession?.access_token ? prev : currentSession));
                if (currentSession) {
                    await fetchUserProfile(currentSession, isRetry);
                } else {
                    loadedUserIdRef.current = null;
                    setUser(null);
                    setLoading(false);
                }
            } catch (err) {
                console.error('❌ Auth: Initialization error:', err);
                if (mounted) setLoading(false);
            } finally {
                isResolving.current = false;
            }
        };

        // Listen for subsequent auth changes without duplicating initial boot fetch
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
            if (!mounted) return;
            if (event === 'INITIAL_SESSION') return;

            setSession(prev => (prev?.access_token === nextSession?.access_token ? prev : nextSession));

            if (!nextSession || event === 'SIGNED_OUT') {
                loadedUserIdRef.current = null;
                setUser(null);
                setLoading(false);
                return;
            }

            if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                const forceRefresh = event === 'USER_UPDATED';
                void fetchUserProfile(nextSession, forceRefresh);
            }
        });

        // Refresh token quietly when tab becomes visible without recreating user state
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void initializeAuth(false);
            }
        };

        void initializeAuth(false);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            mounted = false;
            subscription.unsubscribe();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [fetchUserProfile]);

    const loginWithGoogle = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        if (error) console.error('Error logging in:', error);
    };

    const logout = async () => {
        try {
            await supabase.auth.signOut();
            setUser(null);
            setSession(null);
            // Force a hard reload to the login page to clear all local states
            window.location.href = '/login';
        } catch (error) {
            console.error('Error during logout:', error);
            // Fallback redirect even on error
            window.location.href = '/login';
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!session,
            loginWithGoogle,
            logout,
            loading,
            session
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
