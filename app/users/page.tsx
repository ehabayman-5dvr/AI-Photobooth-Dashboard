'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { UserRole, Project } from '@/types';
import { useAuth } from '@/components/AuthContext';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'next/navigation';

type PeopleFilter = 'all' | 'admin' | 'regular' | 'invited';

interface UnifiedPerson {
    key: string;
    profileId?: string;
    name: string;
    email: string;
    role: UserRole;
    status: 'active' | 'invited';
    lastSignIn: string;
    isMe: boolean;
    isExternal: boolean;
    warning: string;
    avatarBg: string;
    avatarColor: string;
    initials: string;
}

const AVATAR_PALETTE = [
    { bg: '#FFE8F1', color: '#B8004A' },
    { bg: '#EFE3EC', color: '#4B1D3F' },
    { bg: '#F3E9DC', color: '#7A5A2E' },
    { bg: '#E3F9EF', color: '#0B7A4B' },
];

function getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(/[\s._-]+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

function formatShortDate(dateStr?: string): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function UserManagementPage() {
    const { user: currentUser } = useAuth();
    const router = useRouter();

    const [profiles, setProfiles] = useState<
        { id: string; full_name: string; email: string; role: string; updated_at?: string; created_at?: string }[]
    >([]);
    const [whitelist, setWhitelist] = useState<
        { email: string; role: string; created_at: string }[]
    >([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);

    const [filter, setFilter] = useState<PeopleFilter>('all');
    const [toast, setToast] = useState('');

    // Remove confirmation dialog state
    const [removeTarget, setRemoveTarget] = useState<UnifiedPerson | null>(null);
    const [isRemoving, setIsRemoving] = useState(false);

    // Invite dialog state
    const [inviting, setInviting] = useState(false);
    const [invEmail, setInvEmail] = useState('');
    const [invRole, setInvRole] = useState<UserRole>(UserRole.REGULAR);
    const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
    const [projectPickerOpen, setProjectPickerOpen] = useState(false);
    const [projectSearch, setProjectSearch] = useState('');
    const [isSendingInvite, setIsSendingInvite] = useState(false);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => {
            setToast(prev => (prev === msg ? '' : prev));
        }, 3000);
    };

    useEffect(() => {
        if (currentUser && currentUser.role !== UserRole.ADMIN) {
            router.replace('/');
            return;
        }
        if (currentUser?.role === UserRole.ADMIN) {
            fetchData();
        }
    }, [currentUser, router]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [{ data: profileData }, { data: whitelistData }, { data: projectsData }] =
                await Promise.all([
                    supabase.from('profiles').select('*').order('full_name', { ascending: true }),
                    supabase
                        .from('allowed_users')
                        .select('*')
                        .order('created_at', { ascending: false }),
                    supabase.from('projects').select('*').order('created_at', { ascending: false }),
                ]);

            setProfiles(profileData || []);
            setWhitelist(whitelistData || []);
            setProjects(
                (projectsData || []).map(p => ({
                    id: p.id,
                    name: p.name,
                    description: p.description || '',
                    dailyLimit: p.max_usage || 1000,
                    currentGenerations: p.total_usage || 0,
                    createdAt: p.created_at || '',
                    ownerId: p.created_by || '',
                    is_active: p.is_active !== false,
                    status: p.is_active === false ? 'paused' : 'active',
                }))
            );
        } catch (err) {
            console.error('Error fetching people & access:', err);
        } finally {
            setLoading(false);
        }
    };

    // Build unified people list
    const unifiedPeople = useMemo<UnifiedPerson[]>(() => {
        const map = new Map<
            string,
            {
                profile?: (typeof profiles)[0];
                whitelist?: (typeof whitelist)[0];
            }
        >();

        for (const p of profiles) {
            if (!p.email) continue;
            map.set(p.email.toLowerCase(), { profile: p });
        }
        for (const w of whitelist) {
            if (!w.email) continue;
            const key = w.email.toLowerCase();
            const existing = map.get(key) || {};
            map.set(key, { ...existing, whitelist: w });
        }

        const list: UnifiedPerson[] = [];
        let idx = 0;

        Array.from(map.entries())
            .sort((a, b) => {
                const nameA =
                    a[1].profile?.full_name || a[0].split('@')[0];
                const nameB =
                    b[1].profile?.full_name || b[0].split('@')[0];
                return nameA.localeCompare(nameB);
            })
            .forEach(([emailKey, entry]) => {
                const prof = entry.profile;
                const wl = entry.whitelist;
                const roleStr = (wl?.role || prof?.role || 'REGULAR').toUpperCase();
                const role = roleStr === 'ADMIN' ? UserRole.ADMIN : UserRole.REGULAR;
                const isSignedIn = Boolean(prof);
                const name = prof?.full_name || emailKey.split('@')[0];
                const isMe = currentUser?.email?.toLowerCase() === emailKey;
                const isExternal = !emailKey.endsWith('@5d-vr.com');
                const warning =
                    isExternal && role === UserRole.ADMIN
                        ? 'Admin on a personal / external email account'
                        : '';

                const palette = isSignedIn
                    ? AVATAR_PALETTE[idx % AVATAR_PALETTE.length]
                    : { bg: '#E3DFD8', color: '#5C5C66' };
                idx++;

                list.push({
                    key: emailKey,
                    profileId: prof?.id,
                    name,
                    email: prof?.email || wl?.email || emailKey,
                    role,
                    status: isSignedIn ? 'active' : 'invited',
                    lastSignIn: isMe
                        ? 'Now'
                        : isSignedIn
                          ? formatShortDate(prof?.updated_at || prof?.created_at)
                          : '—',
                    isMe,
                    isExternal,
                    warning,
                    avatarBg: palette.bg,
                    avatarColor: palette.color,
                    initials: getInitials(name),
                });
            });

        return list;
    }, [profiles, whitelist, currentUser]);

    const counts = useMemo(() => {
        return {
            all: unifiedPeople.length,
            admin: unifiedPeople.filter(p => p.role === UserRole.ADMIN).length,
            regular: unifiedPeople.filter(p => p.role === UserRole.REGULAR).length,
            invited: unifiedPeople.filter(p => p.status === 'invited').length,
        };
    }, [unifiedPeople]);

    const filteredPeople = useMemo(() => {
        return unifiedPeople.filter(p => {
            if (filter === 'admin') return p.role === UserRole.ADMIN;
            if (filter === 'regular') return p.role === UserRole.REGULAR;
            if (filter === 'invited') return p.status === 'invited';
            return true;
        });
    }, [unifiedPeople, filter]);

    const handleRoleChange = async (person: UnifiedPerson, nextRole: UserRole) => {
        if (person.isMe) return;
        try {
            // Upsert in allowed_users
            await supabase
                .from('allowed_users')
                .upsert([{ email: person.email.toLowerCase(), role: nextRole }], {
                    onConflict: 'email',
                });

            // Update profile if exists
            if (person.profileId) {
                await supabase
                    .from('profiles')
                    .update({ role: nextRole })
                    .eq('id', person.profileId);
            }

            showToast(
                `${person.name} is now ${nextRole === UserRole.ADMIN ? 'an Admin' : 'a Regular user'}`
            );
            await fetchData();
        } catch (err) {
            console.error('Error updating role:', err);
            showToast('Could not update role');
        }
    };

    const handleConfirmRemove = async () => {
        if (!removeTarget) return;
        setIsRemoving(true);
        try {
            const target = removeTarget;
            await supabase
                .from('allowed_users')
                .delete()
                .ilike('email', target.email);

            if (target.profileId) {
                await supabase
                    .from('projects')
                    .update({ created_by: null })
                    .eq('created_by', target.profileId);

                await supabase.from('profiles').delete().eq('id', target.profileId);
            }

            setRemoveTarget(null);
            showToast(`${target.name} no longer has access`);
            await fetchData();
        } catch (err) {
            console.error('Error removing user:', err);
            showToast('Failed to remove access');
        } finally {
            setIsRemoving(false);
        }
    };

    const isInvEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invEmail.trim());
    const isInvExternal =
        isInvEmailValid && !invEmail.trim().toLowerCase().endsWith('@5d-vr.com');
    const isInviteValid =
        isInvEmailValid &&
        (invRole === UserRole.ADMIN || selectedProjectIds.length > 0);

    const handleSendInvite = async () => {
        if (!isInviteValid) return;
        setIsSendingInvite(true);
        const cleanEmail = invEmail.trim().toLowerCase();

        try {
            const { error: insertError } = await supabase
                .from('allowed_users')
                .upsert([{ email: cleanEmail, role: invRole }], { onConflict: 'email' });

            if (insertError) throw insertError;

            // If user already has a profile, update role and assign selected projects
            const existingProfile = profiles.find(
                p => p.email?.toLowerCase() === cleanEmail
            );
            if (existingProfile) {
                await supabase
                    .from('profiles')
                    .update({ role: invRole })
                    .eq('id', existingProfile.id);

                if (invRole === UserRole.REGULAR && selectedProjectIds.length > 0) {
                    const rows = selectedProjectIds.map(pid => ({
                        project_id: pid,
                        user_id: existingProfile.id,
                    }));
                    await supabase
                        .from('project_members')
                        .upsert(rows, { onConflict: 'project_id,user_id' });
                }
            }

            const summary =
                invRole === UserRole.ADMIN
                    ? `Invite sent to ${cleanEmail} as Admin`
                    : `Invite sent to ${cleanEmail} · ${selectedProjectIds.length} project${
                          selectedProjectIds.length === 1 ? '' : 's'
                      }`;

            setInviting(false);
            setInvEmail('');
            setInvRole(UserRole.REGULAR);
            setSelectedProjectIds([]);
            setProjectPickerOpen(false);
            showToast(summary);
            await fetchData();
        } catch (err) {
            console.error('Error inviting person:', err);
            showToast('Failed to send invite');
        } finally {
            setIsSendingInvite(false);
        }
    };

    const matchingProjectsForPicker = useMemo(() => {
        const q = projectSearch.trim().toLowerCase();
        if (!q) return projects;
        return projects.filter(p => p.name.toLowerCase().includes(q));
    }, [projects, projectSearch]);

    if (!currentUser || currentUser.role !== UserRole.ADMIN) return null;

    const filterChips: {
        id: PeopleFilter;
        label: string;
        count: number;
        dot: string;
        activeBg: string;
        activeBorder: string;
        activeColor: string;
    }[] = [
        {
            id: 'all',
            label: 'Everyone',
            count: counts.all,
            dot: '#FF0066',
            activeBg: '#FFE8F1',
            activeBorder: '#FF0066',
            activeColor: '#B8004A',
        },
        {
            id: 'admin',
            label: 'Admins',
            count: counts.admin,
            dot: '#4B1D3F',
            activeBg: '#EFE3EC',
            activeBorder: '#4B1D3F',
            activeColor: '#4B1D3F',
        },
        {
            id: 'regular',
            label: 'Regular',
            count: counts.regular,
            dot: '#5C5C66',
            activeBg: '#E3DFD8',
            activeBorder: '#3A3A42',
            activeColor: '#3A3A42',
        },
        {
            id: 'invited',
            label: 'Invited',
            count: counts.invited,
            dot: '#C9A46B',
            activeBg: '#F3E9DC',
            activeBorder: '#7A5A2E',
            activeColor: '#7A5A2E',
        },
    ];

    const pjSummary =
        selectedProjectIds.length === 0
            ? 'Choose one or more projects'
            : selectedProjectIds.length === 1
              ? projects.find(p => p.id === selectedProjectIds[0])?.name || '1 project selected'
              : `${selectedProjectIds.length} projects selected`;

    return (
        <>
            <header
                className="glow"
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    gap: 24,
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="lbl">Invite-only · Google sign-in</div>
                    <h1
                        style={{
                            margin: 0,
                            fontSize: 'clamp(32px, 4vw, 48px)',
                            fontWeight: 300,
                            letterSpacing: '.04em',
                            textTransform: 'uppercase',
                            lineHeight: 1.1,
                        }}
                    >
                        People &amp; access
                    </h1>
                    <div
                        style={{
                            fontSize: 14,
                            color: '#5C5C66',
                            maxWidth: 560,
                            lineHeight: 1.5,
                        }}
                    >
                        One list. Inviting someone gives their Google account access; removing them takes it away.
                    </div>
                </div>

                <button
                    type="button"
                    className="btn btn-pink"
                    onClick={() => setInviting(true)}
                >
                    <svg
                        aria-hidden="true"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                    >
                        <path d="M12 5v14M5 12h14"></path>
                    </svg>
                    Invite person
                </button>
            </header>

            <div
                role="group"
                aria-label="Filter people"
                style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
            >
                {filterChips.map(c => {
                    const isOn = filter === c.id;
                    return (
                        <button
                            key={c.id}
                            type="button"
                            className="chip"
                            aria-pressed={isOn}
                            onClick={() => setFilter(c.id)}
                            style={
                                isOn
                                    ? {
                                          background: c.activeBg,
                                          borderColor: c.activeBorder,
                                          color: c.activeColor,
                                      }
                                    : undefined
                            }
                        >
                            <i
                                aria-hidden="true"
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    display: 'inline-block',
                                    background: c.dot,
                                }}
                            />
                            {c.label}
                            <span style={{ fontWeight: 800 }}>{c.count}</span>
                        </button>
                    );
                })}
            </div>

            <section
                aria-label="People"
                style={{
                    background: '#F7F5F2',
                    border: '1px solid #E3DFD8',
                    borderRadius: 4,
                    overflowX: 'auto',
                }}
            >
                {loading ? (
                    <div style={{ padding: 48, textAlign: 'center', color: '#5C5C66', fontSize: 14 }}>
                        Loading people &amp; access…
                    </div>
                ) : (
                    <table
                        className="rtable"
                        style={{
                            width: '100%',
                            minWidth: 820,
                            borderCollapse: 'collapse',
                            fontSize: 14,
                        }}
                    >
                        <thead>
                            <tr style={{ textAlign: 'left' }}>
                                <th
                                    scope="col"
                                    className="lbl"
                                    style={{
                                        padding: '16px 24px',
                                        fontWeight: 500,
                                        borderBottom: '1px solid #E3DFD8',
                                    }}
                                >
                                    Person
                                </th>
                                <th
                                    scope="col"
                                    className="lbl"
                                    style={{
                                        padding: '16px 8px',
                                        fontWeight: 500,
                                        borderBottom: '1px solid #E3DFD8',
                                    }}
                                >
                                    Role
                                </th>
                                <th
                                    scope="col"
                                    className="lbl"
                                    style={{
                                        padding: '16px 8px',
                                        fontWeight: 500,
                                        borderBottom: '1px solid #E3DFD8',
                                    }}
                                >
                                    Status
                                </th>
                                <th
                                    scope="col"
                                    className="lbl"
                                    style={{
                                        padding: '16px 8px',
                                        fontWeight: 500,
                                        borderBottom: '1px solid #E3DFD8',
                                    }}
                                >
                                    Last sign-in
                                </th>
                                <th
                                    scope="col"
                                    style={{
                                        padding: '16px 24px',
                                        borderBottom: '1px solid #E3DFD8',
                                    }}
                                >
                                    <span
                                        style={{
                                            position: 'absolute',
                                            width: 1,
                                            height: 1,
                                            overflow: 'hidden',
                                            clip: 'rect(0 0 0 0)',
                                        }}
                                    >
                                        Actions
                                    </span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="stagger">
                            {filteredPeople.map(p => (
                                <tr key={p.key}>
                                    <td
                                        style={{
                                            padding: '12px 24px',
                                            borderBottom: '1px solid #E3DFD8',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div
                                                aria-hidden="true"
                                                style={{
                                                    width: 36,
                                                    height: 36,
                                                    flex: 'none',
                                                    borderRadius: 4,
                                                    background: p.avatarBg,
                                                    color: p.avatarColor,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontWeight: 700,
                                                    fontSize: 14,
                                                }}
                                            >
                                                {p.initials}
                                            </div>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: 4,
                                                    minWidth: 0,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 8,
                                                        flexWrap: 'wrap',
                                                    }}
                                                >
                                                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                                                    {p.isMe && (
                                                        <span className="pill p-plum">
                                                            <i aria-hidden="true"></i>You
                                                        </span>
                                                    )}
                                                    {p.isExternal && (
                                                        <span className="pill p-pink">
                                                            <i aria-hidden="true"></i>External
                                                        </span>
                                                    )}
                                                </div>
                                                <span style={{ fontSize: 13, color: '#5C5C66' }}>
                                                    {p.email}
                                                </span>
                                                {p.warning && (
                                                    <span style={{ fontSize: 12, color: '#050507' }}>
                                                        <b style={{ color: '#C6283D' }}>Check:</b> {p.warning}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    <td
                                        data-l="Role"
                                        style={{
                                            padding: '12px 8px',
                                            borderBottom: '1px solid #E3DFD8',
                                        }}
                                    >
                                        <select
                                            className="field"
                                            aria-label={`Role for ${p.name}`}
                                            disabled={p.isMe}
                                            value={p.role}
                                            onChange={e =>
                                                handleRoleChange(p, e.target.value as UserRole)
                                            }
                                            style={{ width: 140 }}
                                        >
                                            <option value={UserRole.ADMIN}>Admin</option>
                                            <option value={UserRole.REGULAR}>Regular</option>
                                        </select>
                                    </td>

                                    <td
                                        data-l="Status"
                                        style={{
                                            padding: '12px 8px',
                                            borderBottom: '1px solid #E3DFD8',
                                        }}
                                    >
                                        {p.status === 'active' ? (
                                            <span className="pill p-use">
                                                <i className="live" aria-hidden="true"></i>Active
                                            </span>
                                        ) : (
                                            <span className="pill p-sand">
                                                <i aria-hidden="true"></i>Invited · not signed in yet
                                            </span>
                                        )}
                                    </td>

                                    <td
                                        data-l="Last sign-in"
                                        style={{
                                            padding: '12px 8px',
                                            borderBottom: '1px solid #E3DFD8',
                                            color: '#5C5C66',
                                        }}
                                    >
                                        {p.lastSignIn}
                                    </td>

                                    <td
                                        className="act"
                                        style={{
                                            padding: '12px 24px',
                                            borderBottom: '1px solid #E3DFD8',
                                            textAlign: 'right',
                                        }}
                                    >
                                        {!p.isMe && (
                                            <button
                                                type="button"
                                                className="icon-btn danger"
                                                aria-label={`Remove access for ${p.name}`}
                                                title="Remove access"
                                                onClick={() => setRemoveTarget(p)}
                                            >
                                                <svg
                                                    aria-hidden="true"
                                                    width="18"
                                                    height="18"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                >
                                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                                                    <circle cx="9" cy="7" r="4"></circle>
                                                    <path d="M17 11h6"></path>
                                                </svg>
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            {/* Remove Access Confirmation Dialog */}
            {removeTarget && (
                <div
                    className="fadein"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(5,5,7,.45)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 24,
                        zIndex: 10,
                    }}
                >
                    <div
                        className="emerge"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="rm-h"
                        style={{
                            width: '100%',
                            maxWidth: 480,
                            background: '#F7F5F2',
                            borderRadius: 4,
                            padding: 28,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16,
                        }}
                    >
                        <h2 id="rm-h" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
                            Remove {removeTarget.name}&apos;s access?
                        </h2>
                        <div style={{ fontSize: 14, color: '#5C5C66', lineHeight: 1.5 }}>
                            {removeTarget.email} won&apos;t be able to sign in. Their projects and portraits stay. You can invite them again any time.
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                gap: 12,
                                flexWrap: 'wrap',
                                justifyContent: 'flex-end',
                            }}
                        >
                            <button
                                type="button"
                                className="btn"
                                onClick={() => setRemoveTarget(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                disabled={isRemoving}
                                onClick={handleConfirmRemove}
                            >
                                {isRemoving ? 'Removing…' : 'Remove access'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Invite a Person Dialog */}
            {inviting && (
                <div
                    className="fadein"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(5,5,7,.45)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 24,
                        zIndex: 10,
                    }}
                >
                    <div
                        className="emerge"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="inv-h"
                        style={{
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            boxSizing: 'border-box',
                            width: '100%',
                            maxWidth: 520,
                            background: '#F7F5F2',
                            borderRadius: 4,
                            padding: 28,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 20,
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <h2 id="inv-h" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
                                Invite a person
                            </h2>
                            <div style={{ fontSize: 14, color: '#5C5C66' }}>
                                Email, role, and the projects they can see. They sign in with this Google account.
                            </div>
                        </div>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <span className="lbl" style={{ fontSize: 10 }}>
                                Email
                            </span>
                            <input
                                className="field"
                                type="email"
                                placeholder="name@5d-vr.com"
                                value={invEmail}
                                onChange={e => setInvEmail(e.target.value)}
                                style={{ minHeight: 44, fontSize: 14 }}
                            />
                        </label>

                        {isInvExternal && (
                            <div style={{ fontSize: 13, color: '#050507' }}>
                                <b style={{ color: '#C6283D' }}>Check:</b> this isn&apos;t a 5d-vr.com address.
                            </div>
                        )}

                        <fieldset
                            style={{
                                border: 0,
                                margin: 0,
                                padding: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                            }}
                        >
                            <legend
                                className="lbl"
                                style={{ fontSize: 10, padding: 0, marginBottom: 8 }}
                            >
                                Role
                            </legend>
                            <label
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    fontSize: 14,
                                    minHeight: 40,
                                    cursor: 'pointer',
                                }}
                            >
                                <input
                                    type="radio"
                                    name="role"
                                    checked={invRole === UserRole.REGULAR}
                                    onChange={() => setInvRole(UserRole.REGULAR)}
                                    style={{ width: 18, height: 18, accentColor: '#FF0066' }}
                                />
                                Regular · sees the projects they&apos;re added to
                            </label>
                            <label
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    fontSize: 14,
                                    minHeight: 40,
                                    cursor: 'pointer',
                                }}
                            >
                                <input
                                    type="radio"
                                    name="role"
                                    checked={invRole === UserRole.ADMIN}
                                    onChange={() => setInvRole(UserRole.ADMIN)}
                                    style={{ width: 18, height: 18, accentColor: '#FF0066' }}
                                />
                                Admin · sees and manages everything
                            </label>
                        </fieldset>

                        {invRole === UserRole.REGULAR ? (
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 8,
                                    position: 'relative',
                                }}
                            >
                                <span className="lbl" id="pj-l" style={{ fontSize: 10 }}>
                                    Projects
                                </span>
                                <button
                                    className="field msel"
                                    type="button"
                                    aria-haspopup="listbox"
                                    aria-expanded={projectPickerOpen}
                                    aria-labelledby="pj-l"
                                    onClick={() => setProjectPickerOpen(prev => !prev)}
                                >
                                    <span
                                        style={{
                                            color:
                                                selectedProjectIds.length === 0
                                                    ? '#5C5C66'
                                                    : '#050507',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {pjSummary}
                                    </span>
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
                                        <path d="M6 9l6 6 6-6"></path>
                                    </svg>
                                </button>

                                {projectPickerOpen && (
                                    <div
                                        className="emerge"
                                        style={{
                                            background: '#F7F5F2',
                                            border: '1px solid #CFCAC1',
                                            borderRadius: 4,
                                            boxShadow: '0 18px 36px -18px rgba(5,5,7,.45)',
                                            padding: 8,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 6,
                                        }}
                                    >
                                        <input
                                            className="field"
                                            type="search"
                                            placeholder="Search projects"
                                            aria-label="Search projects"
                                            value={projectSearch}
                                            onChange={e => setProjectSearch(e.target.value)}
                                            style={{ minHeight: 40, fontSize: 13 }}
                                        />
                                        <div
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '0 4px',
                                                fontSize: 12,
                                                color: '#5C5C66',
                                            }}
                                        >
                                            <span>{selectedProjectIds.length} selected</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (
                                                        selectedProjectIds.length === projects.length
                                                    ) {
                                                        setSelectedProjectIds([]);
                                                    } else {
                                                        setSelectedProjectIds(projects.map(p => p.id));
                                                    }
                                                }}
                                                style={{
                                                    border: 0,
                                                    background: 'transparent',
                                                    color: '#050507',
                                                    fontFamily: 'inherit',
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    textDecoration: 'underline',
                                                    textDecorationColor: '#FF0066',
                                                    textUnderlineOffset: 3,
                                                    cursor: 'pointer',
                                                    minHeight: 32,
                                                }}
                                            >
                                                {selectedProjectIds.length === projects.length
                                                    ? 'Clear all'
                                                    : 'Select all'}
                                            </button>
                                        </div>

                                        <div
                                            role="listbox"
                                            aria-multiselectable="true"
                                            aria-labelledby="pj-l"
                                            style={{
                                                maxHeight: 220,
                                                overflowY: 'auto',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 2,
                                            }}
                                        >
                                            {matchingProjectsForPicker.map(o => {
                                                const isOn = selectedProjectIds.includes(o.id);
                                                const isFinished =
                                                    o.is_active === false || o.status === 'paused';
                                                const pillCls = isFinished
                                                    ? 'pill p-done'
                                                    : 'pill p-use';
                                                const statusText = isFinished
                                                    ? 'Finished'
                                                    : 'In use';

                                                return (
                                                    <label
                                                        key={o.id}
                                                        className={`mopt${isOn ? ' on' : ''}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isOn}
                                                            onChange={() =>
                                                                setSelectedProjectIds(prev =>
                                                                    isOn
                                                                        ? prev.filter(id => id !== o.id)
                                                                        : [...prev, o.id]
                                                                )
                                                            }
                                                        />
                                                        <span
                                                            style={{
                                                                flex: 1,
                                                                minWidth: 0,
                                                                whiteSpace: 'nowrap',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                            }}
                                                        >
                                                            {o.name}
                                                        </span>
                                                        <span
                                                            className={pillCls}
                                                            style={{ fontSize: 11, padding: '2px 8px' }}
                                                        >
                                                            <i aria-hidden="true"></i>
                                                            {statusText}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                            {matchingProjectsForPicker.length === 0 && (
                                                <div
                                                    style={{
                                                        padding: 12,
                                                        fontSize: 13,
                                                        color: '#5C5C66',
                                                    }}
                                                >
                                                    No projects match.
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={() => setProjectPickerOpen(false)}
                                            style={{ minHeight: 40, alignSelf: 'flex-end' }}
                                        >
                                            Done
                                        </button>
                                    </div>
                                )}

                                {selectedProjectIds.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {selectedProjectIds.map(pid => {
                                            const proj = projects.find(p => p.id === pid);
                                            if (!proj) return null;
                                            return (
                                                <span key={pid} className="pill p-plum emerge">
                                                    <i aria-hidden="true"></i>
                                                    {proj.name}
                                                    <button
                                                        type="button"
                                                        aria-label={`Remove ${proj.name}`}
                                                        onClick={() =>
                                                            setSelectedProjectIds(prev =>
                                                                prev.filter(id => id !== pid)
                                                            )
                                                        }
                                                        style={{
                                                            border: 0,
                                                            background: 'transparent',
                                                            color: 'inherit',
                                                            cursor: 'pointer',
                                                            padding: '0 0 0 4px',
                                                            fontSize: 14,
                                                            lineHeight: 1,
                                                        }}
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div
                                style={{
                                    fontSize: 13,
                                    color: '#5C5C66',
                                    padding: '12px 14px',
                                    background: '#EFE3EC',
                                    borderRadius: 4,
                                }}
                            >
                                Admins see and manage every project, so there&apos;s nothing to pick.
                            </div>
                        )}

                        <div
                            style={{
                                display: 'flex',
                                gap: 12,
                                flexWrap: 'wrap',
                                justifyContent: 'flex-end',
                            }}
                        >
                            <button
                                type="button"
                                className="btn"
                                onClick={() => setInviting(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-pink"
                                disabled={!isInviteValid || isSendingInvite}
                                onClick={handleSendInvite}
                            >
                                {isSendingInvite ? 'Sending…' : 'Send invite'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div
                    className="toast"
                    role="status"
                    style={{
                        position: 'fixed',
                        bottom: 32,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '14px 20px',
                        background: '#050507',
                        color: '#F7F5F2',
                        borderRadius: 4,
                        fontSize: 14,
                        fontWeight: 500,
                        zIndex: 11,
                    }}
                >
                    {toast}
                </div>
            )}
        </>
    );
}
