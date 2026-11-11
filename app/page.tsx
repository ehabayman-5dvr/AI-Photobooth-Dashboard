'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Project, UserRole, UsageLog } from '@/types';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/components/AuthContext';

type OverviewRange = '7' | '30' | '90' | 'all' | 'custom';

function computeChartStep(maxVal: number): number {
    const candidates = [1, 2, 5, 10, 20, 25, 50, 100, 150, 200, 250, 500, 1000, 2500, 5000];
    for (const step of candidates) {
        if (step * 3 >= maxVal && step * 3 > 0) return step;
    }
    return Math.ceil(Math.max(15, maxVal) / 3);
}

function formatShortDate(dateInput: string | Date): string {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getProjectDisplayStatus(project: Project): {
    label: string;
    pillClass: string;
    dotClass: string;
    category: 'use' | 'done';
} {
    if (project.is_active === false || project.status === 'paused') {
        return { label: 'Finished', pillClass: 'pill p-done', dotClass: '', category: 'done' };
    }
    return { label: 'In use', pillClass: 'pill p-use', dotClass: 'live', category: 'use' };
}

export default function DashboardPage() {
    const { user } = useAuth();

    const [allProjects, setAllProjects] = useState<Project[]>([]);
    const [profilesList, setProfilesList] = useState<{ id: string; email: string; role: string }[]>([]);
    const [whitelistList, setWhitelistList] = useState<{ email: string; role: string }[]>([]);
    const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<OverviewRange>('30');
    const [customRange, setCustomRange] = useState({
        start: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0],
    });

    useEffect(() => {
        if (user) {
            fetchDashboardData();
        }
    }, [user]);

    const fetchDashboardData = async () => {
        setIsLoading(true);
        try {
            let projectsQuery = supabase.from('projects').select('*');

            if (user?.role !== UserRole.ADMIN) {
                const { data: memberProjects } = await supabase
                    .from('project_members')
                    .select('project_id')
                    .eq('user_id', user?.id);

                const memberIds = (memberProjects || []).map(m => m.project_id);
                projectsQuery = projectsQuery.or(
                    `created_by.eq.${user?.id},id.in.(${memberIds.length ? memberIds.join(',') : '00000000-0000-0000-0000-000000000000'})`
                );
            }

            const { data: projectsData } = await projectsQuery.order('total_usage', { ascending: false });

            const mappedProjects: Project[] = (projectsData || []).map(p => ({
                id: p.id,
                name: p.name,
                description: p.description || '',
                dailyLimit: p.max_usage || 1000,
                currentGenerations: p.total_usage || 0,
                is_active: p.is_active !== false,
                status: p.is_active === false ? 'paused' : 'active',
                enablePrinting: typeof p.enable_printing === 'boolean' ? p.enable_printing : true,
                totalPrintedCopies: p.total_printed_copies || 0,
                createdAt: p.created_at || '',
                ownerId: p.created_by || '',
            }));
            setAllProjects(mappedProjects);

            if (user?.role === UserRole.ADMIN) {
                const [{ data: profilesData }, { data: allowedData }] = await Promise.all([
                    supabase.from('profiles').select('id, email, role'),
                    supabase.from('allowed_users').select('email, role'),
                ]);
                setProfilesList(profilesData || []);
                setWhitelistList(allowedData || []);
            }

            let logsQuery = supabase
                .from('usage_logs')
                .select('*')
                .order('timestamp', { ascending: true });

            if (user?.role !== UserRole.ADMIN) {
                const projectIds = mappedProjects.map(p => p.id);
                if (projectIds.length > 0) {
                    logsQuery = logsQuery.in('project_id', projectIds);
                } else {
                    logsQuery = logsQuery.eq('project_id', '00000000-0000-0000-0000-000000000000');
                }
            }

            const { data: logsData } = await logsQuery;
            setUsageLogs(
                (logsData || []).map(l => ({
                    id: l.id,
                    projectId: l.project_id,
                    timestamp: l.timestamp,
                    amount: l.amount || 1,
                }))
            );
        } catch (err) {
            console.error('Error fetching dashboard data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const isAdmin = user?.role === UserRole.ADMIN;

    const todayLabel = useMemo(() => {
        const now = new Date();
        return now.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
        });
    }, []);

    // Map last portrait date per project
    const lastPortraitByProject = useMemo(() => {
        const map: Record<string, string> = {};
        for (const log of usageLogs) {
            if (!map[log.projectId] || log.timestamp > map[log.projectId]) {
                map[log.projectId] = log.timestamp;
            }
        }
        return map;
    }, [usageLogs]);

    // KPI computations
    const kpiData = useMemo(() => {
        const totalPortraits = allProjects.reduce((sum, p) => sum + (p.currentGenerations || 0), 0);

        // Busiest day from usage_logs
        const dayCounts: Record<string, number> = {};
        for (const log of usageLogs) {
            const dKey = log.timestamp.split('T')[0];
            dayCounts[dKey] = (dayCounts[dKey] || 0) + (log.amount || 1);
        }
        let busiestDate = '';
        let busiestCount = 0;
        for (const [dKey, count] of Object.entries(dayCounts)) {
            if (count > busiestCount) {
                busiestCount = count;
                busiestDate = dKey;
            }
        }

        const inUseCount = allProjects.filter(p => getProjectDisplayStatus(p).category === 'use').length;
        const finishedCount = allProjects.filter(p => getProjectDisplayStatus(p).category === 'done').length;

        // Closest to limit
        let closestProject: Project | null = null;
        let closestRatio = -1;
        for (const p of allProjects) {
            const limit = Math.max(1, p.dailyLimit || 1000);
            const ratio = (p.currentGenerations || 0) / limit;
            if (ratio > closestRatio) {
                closestRatio = ratio;
                closestProject = p;
            }
        }

        const closestPct = closestProject
            ? Math.min(100, Math.round(((closestProject.currentGenerations || 0) / Math.max(1, closestProject.dailyLimit || 1000)) * 100))
            : 0;
        const closestRemaining = closestProject
            ? Math.max(0, (closestProject.dailyLimit || 1000) - (closestProject.currentGenerations || 0))
            : 0;

        // People stats
        const profileEmails = new Set(profilesList.map(p => p.email.toLowerCase()));
        const allEmails = new Map<string, { role: string; signedIn: boolean }>();
        for (const p of profilesList) {
            allEmails.set(p.email.toLowerCase(), { role: p.role, signedIn: true });
        }
        for (const w of whitelistList) {
            const lower = w.email.toLowerCase();
            if (!allEmails.has(lower)) {
                allEmails.set(lower, { role: w.role, signedIn: profileEmails.has(lower) });
            }
        }

        let adminsCount = 0;
        let regularsCount = 0;
        let invitedCount = 0;
        allEmails.forEach(val => {
            if (val.role === UserRole.ADMIN) adminsCount++;
            else regularsCount++;
            if (!val.signedIn) invitedCount++;
        });

        return {
            totalPortraits,
            projectsWithPortraits: allProjects.filter(p => (p.currentGenerations || 0) > 0).length,
            busiestDateStr: busiestDate ? formatShortDate(busiestDate) : '',
            inUseCount,
            finishedCount,
            closestProject,
            closestPct,
            closestRemaining,
            totalPeople: allEmails.size || profilesList.length,
            adminsCount,
            regularsCount,
            invitedCount,
        };
    }, [allProjects, usageLogs, profilesList, whitelistList]);

    // Chart computation matching §6.12
    const chartView = useMemo(() => {
        const now = new Date();
        let buckets: { key: string; label: string; tipDate: string; count: number }[] = [];
        let title = 'Portraits per day';
        let rangeSubtitle = '';

        const lastLog = usageLogs.length > 0 ? usageLogs[usageLogs.length - 1] : null;
        const lastPortraitText = lastLog ? ` · last portrait ${formatShortDate(lastLog.timestamp)}` : '';

        if (timeRange === '7' || timeRange === '30' || timeRange === 'custom') {
            title = 'Portraits per day';
            let startDate: Date;
            let endDate: Date = new Date(now);
            let days = 30;

            if (timeRange === 'custom') {
                startDate = new Date(customRange.start);
                endDate = new Date(customRange.end);
                if (isNaN(startDate.getTime())) startDate = new Date(now.getTime() - 7 * 86400000);
                if (isNaN(endDate.getTime())) endDate = new Date(now);
                days = Math.max(1, Math.min(90, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1));
            } else {
                days = timeRange === '7' ? 7 : 30;
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - (days - 1));
            }

            for (let i = 0; i < days; i++) {
                const d = new Date(startDate);
                d.setDate(startDate.getDate() + i);
                const key = d.toISOString().split('T')[0];
                const shortD = formatShortDate(d);
                buckets.push({ key, label: shortD, tipDate: shortD, count: 0 });
            }

            const map = new Map(buckets.map(b => [b.key, b]));
            for (const log of usageLogs) {
                const dKey = log.timestamp.split('T')[0];
                const b = map.get(dKey);
                if (b) b.count += log.amount || 1;
            }

            if (buckets.length > 0) {
                rangeSubtitle = `${buckets[0].tipDate} – ${buckets[buckets.length - 1].tipDate}${lastPortraitText}`;
            }
        } else if (timeRange === '90') {
            title = 'Portraits per week';
            const weeks = 13;
            const startAll = new Date(now);
            startAll.setDate(startAll.getDate() - (weeks * 7 - 1));
            for (let w = 0; w < weeks; w++) {
                const wStart = new Date(startAll);
                wStart.setDate(startAll.getDate() + w * 7);
                const shortD = formatShortDate(wStart);
                buckets.push({
                    key: wStart.toISOString().split('T')[0],
                    label: shortD,
                    tipDate: `Week of ${shortD}`,
                    count: 0,
                });
            }

            for (const log of usageLogs) {
                const t = new Date(log.timestamp).getTime();
                const diffDays = Math.floor((t - startAll.getTime()) / 86400000);
                const idx = Math.floor(diffDays / 7);
                if (idx >= 0 && idx < buckets.length) {
                    buckets[idx].count += log.amount || 1;
                }
            }

            let busiestWeek = '';
            let busiestWeekMax = 0;
            for (const b of buckets) {
                if (b.count > busiestWeekMax) {
                    busiestWeekMax = b.count;
                    busiestWeek = b.label;
                }
            }
            rangeSubtitle = `${buckets[0]?.label || ''} – ${formatShortDate(now)}${
                busiestWeek ? ` · busiest week: ${busiestWeek}` : ''
            }`;
        } else {
            title = 'Portraits per month';
            const months = 6;
            for (let m = months - 1; m >= 0; m--) {
                const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const mLabel = d.toLocaleDateString('en-US', { month: 'short' });
                buckets.push({ key, label: mLabel, tipDate: mLabel, count: 0 });
            }
            const map = new Map(buckets.map(b => [b.key, b]));
            for (const log of usageLogs) {
                const mKey = log.timestamp.slice(0, 7);
                const b = map.get(mKey);
                if (b) b.count += log.amount || 1;
            }
            rangeSubtitle = `Since the first event · ${kpiData.totalPortraits.toLocaleString()} portraits`;
        }

        const maxVal = buckets.reduce((m, b) => Math.max(m, b.count), 0);
        const step = computeChartStep(maxVal);
        const maxAxis = step * 3;
        const yLabels = [String(step * 3), String(step * 2), String(step), '0'];

        // X-axis label spacing per §6.12: <= 8 bars label every bar; longer periods label 5 evenly spaced bars
        const n = buckets.length;
        const labeledIndices = new Set<number>();
        if (n <= 8) {
            for (let i = 0; i < n; i++) labeledIndices.add(i);
        } else {
            labeledIndices.add(0);
            labeledIndices.add(Math.round((n - 1) * 0.25));
            labeledIndices.add(Math.round((n - 1) * 0.5));
            labeledIndices.add(Math.round((n - 1) * 0.75));
            labeledIndices.add(n - 1);
        }

        const bars = buckets.map((b, i) => {
            const isPeak = maxVal > 0 && b.count === maxVal;
            const heightPx =
                b.count === 0
                    ? '2px'
                    : `${Math.max(3, Math.round((b.count / maxAxis) * 240))}px`;
            const color = b.count === 0 ? '#E3DFD8' : isPeak ? '#FF0066' : '#FF80B3';

            return {
                key: `${b.key}-${i}`,
                v: b.count,
                showVal: b.count > 0,
                valCls: isPeak ? 'bval peak' : 'bval',
                color,
                h: heightPx,
                tip: `${b.tipDate}: ${b.count} portraits`,
                x: labeledIndices.has(i) ? b.label : '',
            };
        });

        return {
            title,
            rangeSubtitle,
            yLabels,
            bars,
            maxVal,
            chartLabel: `Bar chart, ${title.toLowerCase()}, highest ${maxVal}`,
        };
    }, [usageLogs, timeRange, customRange, kpiData.totalPortraits]);

    const topProjects = useMemo(() => {
        return [...allProjects]
            .sort((a, b) => (b.currentGenerations || 0) - (a.currentGenerations || 0))
            .slice(0, 5);
    }, [allProjects]);

    if (!user) return null;

    const segments: { id: OverviewRange; label: string }[] = [
        { id: '7', label: '7 days' },
        { id: '30', label: '30 days' },
        { id: '90', label: '90 days' },
        { id: 'all', label: 'All time' },
        { id: 'custom', label: 'Custom…' },
    ];

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
                    <div className="lbl">Overview · {todayLabel}</div>
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
                        All booths. <span style={{ fontWeight: 800, color: '#FF0066' }}>One view.</span>
                    </h1>
                </div>
                {isAdmin && (
                    <Link className="btn btn-pink" href="/projects?new=1">
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
                        New project
                    </Link>
                )}
            </header>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
                <div
                    style={{
                        flex: '1 1 100%',
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 24,
                    }}
                >
                    {/* KPI Row */}
                    <section
                        aria-label="Key numbers"
                        className="stagger"
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: 16,
                        }}
                    >
                        {/* 1. Portraits Made (Void Hero Card) */}
                        <div
                            className="lift"
                            style={{
                                background: '#050507',
                                color: '#F7F5F2',
                                border: '1px solid #050507',
                                borderRadius: 4,
                                padding: 24,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 12,
                                position: 'relative',
                                overflow: 'hidden',
                            }}
                        >
                            <Link className="cardlink" href="/projects" aria-label="Portraits made: see projects" />
                            <div
                                aria-hidden="true"
                                style={{
                                    position: 'absolute',
                                    left: '-20%',
                                    right: '-20%',
                                    bottom: -60,
                                    height: 120,
                                    background: 'radial-gradient(closest-side, rgba(255,0,102,.45), rgba(255,0,102,0))',
                                    pointerEvents: 'none',
                                }}
                            />
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    position: 'relative',
                                }}
                            >
                                <div className="lbl" style={{ color: '#8C8C96' }}>
                                    Portraits made
                                </div>
                                <span
                                    className="kpi-ico"
                                    aria-hidden="true"
                                    style={{ background: '#1A1A20', color: '#FF0066' }}
                                >
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <rect x="5" y="3" width="14" height="18" rx="1"></rect>
                                        <rect x="8" y="6" width="8" height="9"></rect>
                                    </svg>
                                </span>
                            </div>
                            <div
                                style={{
                                    fontSize: 48,
                                    fontWeight: 800,
                                    color: '#FF0066',
                                    lineHeight: 1,
                                    position: 'relative',
                                }}
                            >
                                {kpiData.totalPortraits.toLocaleString()}
                            </div>
                            <div
                                style={{
                                    fontSize: 13,
                                    color: '#8C8C96',
                                    lineHeight: 1.5,
                                    position: 'relative',
                                }}
                            >
                                {isAdmin
                                    ? `All time, across ${kpiData.projectsWithPortraits || allProjects.length} projects.${
                                          kpiData.busiestDateStr ? ` Busiest day: ${kpiData.busiestDateStr}.` : ''
                                      }`
                                    : `In the projects you're added to.${
                                          kpiData.busiestDateStr ? ` Busiest day: ${kpiData.busiestDateStr}.` : ''
                                      }`}
                            </div>
                        </div>

                        {/* 2. Projects in use */}
                        <div
                            className="lift"
                            style={{
                                background: '#F7F5F2',
                                border: '1px solid #E3DFD8',
                                borderRadius: 4,
                                padding: 24,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 12,
                                position: 'relative',
                            }}
                        >
                            <Link className="cardlink" href="/projects" aria-label="Projects in use: see projects" />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div className="lbl">{isAdmin ? 'Projects in use' : 'Your projects'}</div>
                                <span
                                    className="kpi-ico"
                                    aria-hidden="true"
                                    style={{ background: '#E3F9EF', color: '#0B7A4B' }}
                                >
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <circle cx="12" cy="12" r="9"></circle>
                                        <path d="M10 8.5l5 3.5-5 3.5z"></path>
                                    </svg>
                                </span>
                            </div>
                            <div style={{ fontSize: 40, fontWeight: 300 }}>
                                {isAdmin ? kpiData.inUseCount : allProjects.length}{' '}
                                <span style={{ fontSize: 18, color: '#5C5C66' }}>
                                    {isAdmin ? `of ${allProjects.length}` : 'assigned'}
                                </span>
                            </div>
                            <div style={{ fontSize: 13, color: '#5C5C66', lineHeight: 1.5 }}>
                                {isAdmin
                                    ? `${kpiData.inUseCount} in use · ${kpiData.finishedCount} finished.`
                                    : `${kpiData.inUseCount} in use · ${kpiData.finishedCount} finished.`}
                            </div>
                        </div>

                        {/* 3. Closest to its limit */}
                        <div
                            className="lift"
                            style={{
                                background: '#F7F5F2',
                                border: '1px solid #E3DFD8',
                                borderRadius: 4,
                                padding: 24,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 12,
                                position: 'relative',
                            }}
                        >
                            <Link
                                className="cardlink"
                                href={kpiData.closestProject ? `/projects/${kpiData.closestProject.id}` : '/projects'}
                                aria-label={
                                    kpiData.closestProject
                                        ? `Closest to its limit: open ${kpiData.closestProject.name}`
                                        : 'Closest to its limit: see projects'
                                }
                            />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div className="lbl">Closest to its limit</div>
                                <span
                                    className="kpi-ico"
                                    aria-hidden="true"
                                    style={{ background: '#F3E9DC', color: '#7A5A2E' }}
                                >
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M4 16a8 8 0 0 1 16 0"></path>
                                        <path d="M12 16l4-5"></path>
                                    </svg>
                                </span>
                            </div>
                            <div style={{ fontSize: 40, fontWeight: 300 }}>{kpiData.closestPct}%</div>
                            <div style={{ fontSize: 13, color: '#5C5C66', lineHeight: 1.5 }}>
                                {kpiData.closestProject
                                    ? `${kpiData.closestProject.name} · ${kpiData.closestRemaining.toLocaleString()} portraits left.`
                                    : 'No active projects yet.'}
                            </div>
                        </div>

                        {/* 4. People with access (Admin only) */}
                        {isAdmin && (
                            <div
                                className="lift"
                                style={{
                                    background: '#F7F5F2',
                                    border: '1px solid #E3DFD8',
                                    borderRadius: 4,
                                    padding: 24,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 12,
                                    position: 'relative',
                                }}
                            >
                                <Link
                                    className="cardlink"
                                    href="/users"
                                    aria-label="People with access: open People and access"
                                />
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div className="lbl">People with access</div>
                                    <span
                                        className="kpi-ico"
                                        aria-hidden="true"
                                        style={{ background: '#EFE3EC', color: '#4B1D3F' }}
                                    >
                                        <svg
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.8"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <circle cx="9" cy="8" r="3.5"></circle>
                                            <path d="M3 20a6 6 0 0 1 12 0"></path>
                                            <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 20a6 6 0 0 0-3-5.2"></path>
                                        </svg>
                                    </span>
                                </div>
                                <div style={{ fontSize: 40, fontWeight: 300 }}>{kpiData.totalPeople}</div>
                                <div style={{ fontSize: 13, color: '#5C5C66', lineHeight: 1.5 }}>
                                    {kpiData.adminsCount} admins, {kpiData.regularsCount} regular.{' '}
                                    {kpiData.invitedCount > 0
                                        ? `${kpiData.invitedCount} invites not used yet.`
                                        : 'All invited users active.'}
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Bar Chart Section */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' }}>
                        <section
                            aria-labelledby="chart-h"
                            style={{
                                flex: '1 1 100%',
                                minWidth: 0,
                                background: '#F7F5F2',
                                border: '1px solid #E3DFD8',
                                borderRadius: 4,
                                padding: 24,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 24,
                            }}
                        >
                            <div className="chart-head">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <h2 id="chart-h" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                                        {chartView.title}
                                    </h2>
                                    <div style={{ fontSize: 13, color: '#5C5C66' }}>{chartView.rangeSubtitle}</div>
                                </div>

                                <div
                                    role="group"
                                    aria-label="Date range"
                                    style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: 4,
                                        padding: 4,
                                        border: '1px solid #E3DFD8',
                                        borderRadius: 4,
                                    }}
                                >
                                    {segments.map(seg => {
                                        const isOn = timeRange === seg.id;
                                        return (
                                            <button
                                                key={seg.id}
                                                type="button"
                                                className={`seg${isOn ? ' on' : ''}`}
                                                aria-pressed={isOn}
                                                onClick={() => setTimeRange(seg.id)}
                                            >
                                                {seg.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {timeRange === 'custom' && (
                                <div
                                    className="emerge"
                                    style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: 12,
                                        alignItems: 'flex-end',
                                        padding: 16,
                                        background: '#EFECE6',
                                        borderRadius: 4,
                                    }}
                                >
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <span className="lbl" style={{ fontSize: 10 }}>
                                            From
                                        </span>
                                        <input
                                            className="field"
                                            type="date"
                                            value={customRange.start}
                                            onChange={e =>
                                                setCustomRange(prev => ({ ...prev, start: e.target.value }))
                                            }
                                            style={{ minHeight: 40, padding: '0 10px', width: 'auto' }}
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <span className="lbl" style={{ fontSize: 10 }}>
                                            To
                                        </span>
                                        <input
                                            className="field"
                                            type="date"
                                            value={customRange.end}
                                            onChange={e =>
                                                setCustomRange(prev => ({ ...prev, end: e.target.value }))
                                            }
                                            style={{ minHeight: 40, padding: '0 10px', width: 'auto' }}
                                        />
                                    </label>
                                    <span
                                        style={{
                                            fontSize: 13,
                                            color: '#5C5C66',
                                            minHeight: 40,
                                            display: 'flex',
                                            alignItems: 'center',
                                        }}
                                    >
                                        Showing daily portraits in this range
                                    </span>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 12 }}>
                                <div
                                    aria-hidden="true"
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        fontSize: 11,
                                        color: '#5C5C66',
                                        height: 240,
                                        textAlign: 'right',
                                        minWidth: 28,
                                    }}
                                >
                                    {chartView.yLabels.map((y, idx) => (
                                        <span key={idx}>{y}</span>
                                    ))}
                                </div>
                                <div
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 8,
                                        minWidth: 0,
                                    }}
                                >
                                    <div
                                        role="img"
                                        aria-label={chartView.chartLabel}
                                        style={{
                                            height: 240,
                                            display: 'flex',
                                            alignItems: 'flex-end',
                                            gap: 6,
                                            borderBottom: '1px solid #CFCAC1',
                                            background:
                                                'repeating-linear-gradient(to top, transparent 0, transparent 79px, #E3DFD8 79px, #E3DFD8 80px)',
                                        }}
                                    >
                                        {chartView.bars.map(b => (
                                            <div key={b.key} className="bcol">
                                                {b.showVal && <span className={b.valCls}>{b.v}</span>}
                                                <div
                                                    className="bar"
                                                    title={b.tip}
                                                    style={{
                                                        width: '100%',
                                                        maxWidth: 44,
                                                        borderRadius: '2px 2px 0 0',
                                                        background: b.color,
                                                        height: b.h,
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div aria-hidden="true" className="xrow">
                                        {chartView.bars.map(b => (
                                            <span key={b.key}>{b.x}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Most Active Projects Table */}
                    <section
                        aria-labelledby="act-h"
                        style={{
                            background: '#F7F5F2',
                            border: '1px solid #E3DFD8',
                            borderRadius: 4,
                            padding: 24,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 16,
                                flexWrap: 'wrap',
                            }}
                        >
                            <h2 id="act-h" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                                Most active projects
                            </h2>
                            <Link href="/projects" style={{ fontSize: 13, fontWeight: 600 }}>
                                {isAdmin ? `All ${allProjects.length} projects` : 'Your projects'}
                            </Link>
                        </div>

                        {isLoading ? (
                            <div style={{ padding: '24px 0', fontSize: 14, color: '#5C5C66' }}>
                                Loading projects…
                            </div>
                        ) : topProjects.length === 0 ? (
                            <div
                                style={{
                                    padding: '32px 16px',
                                    textAlign: 'center',
                                    color: '#5C5C66',
                                    fontSize: 14,
                                    border: '1px dashed #CFCAC1',
                                    borderRadius: 4,
                                }}
                            >
                                No projects assigned yet.
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table
                                    className="rtable"
                                    style={{
                                        width: '100%',
                                        minWidth: 720,
                                        borderCollapse: 'collapse',
                                        fontSize: 14,
                                        tableLayout: 'fixed',
                                    }}
                                >
                                    <thead>
                                        <tr style={{ textAlign: 'left' }}>
                                            <th
                                                scope="col"
                                                className="lbl"
                                                style={{
                                                    padding: '12px 8px',
                                                    fontWeight: 500,
                                                    borderBottom: '1px solid #E3DFD8',
                                                }}
                                            >
                                                Project
                                            </th>
                                            <th
                                                scope="col"
                                                className="lbl"
                                                style={{
                                                    padding: '12px 8px',
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
                                                    padding: '12px 8px',
                                                    fontWeight: 500,
                                                    borderBottom: '1px solid #E3DFD8',
                                                    width: '30%',
                                                }}
                                            >
                                                Used
                                            </th>
                                            <th
                                                scope="col"
                                                className="lbl"
                                                style={{
                                                    padding: '12px 8px',
                                                    fontWeight: 500,
                                                    borderBottom: '1px solid #E3DFD8',
                                                }}
                                            >
                                                Last portrait
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="stagger">
                                        {topProjects.map(p => {
                                            const st = getProjectDisplayStatus(p);
                                            const limit = Math.max(1, p.dailyLimit || 1000);
                                            const used = p.currentGenerations || 0;
                                            const pct = `${Math.min(100, Math.round((used / limit) * 100))}%`;
                                            const lastTs = lastPortraitByProject[p.id] || p.createdAt;
                                            const lastFormatted =
                                                used > 0 && lastTs ? formatShortDate(lastTs) : '—';

                                            return (
                                                <tr key={p.id}>
                                                    <td
                                                        style={{
                                                            padding: '0 8px',
                                                            height: 60,
                                                            borderBottom: '1px solid #E3DFD8',
                                                            maxWidth: 0,
                                                            width: '34%',
                                                        }}
                                                    >
                                                        <Link
                                                            className="row-link"
                                                            href={`/projects/${p.id}`}
                                                            title={p.name}
                                                            style={{
                                                                display: 'block',
                                                                whiteSpace: 'nowrap',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                            }}
                                                        >
                                                            {p.name}
                                                        </Link>
                                                    </td>
                                                    <td
                                                        data-l="Status"
                                                        style={{
                                                            padding: '0 8px',
                                                            height: 60,
                                                            borderBottom: '1px solid #E3DFD8',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        <span className={st.pillClass}>
                                                            <i className={st.dotClass} aria-hidden="true"></i>
                                                            {st.label}
                                                        </span>
                                                    </td>
                                                    <td
                                                        data-l="Used"
                                                        style={{
                                                            padding: '0 8px',
                                                            height: 60,
                                                            borderBottom: '1px solid #E3DFD8',
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 12,
                                                                flex: 1,
                                                                justifyContent: 'flex-end',
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    flex: 1,
                                                                    height: 4,
                                                                    background: '#E3DFD8',
                                                                    borderRadius: 2,
                                                                }}
                                                            >
                                                                <div
                                                                    className="fill"
                                                                    style={{
                                                                        height: 4,
                                                                        borderRadius: 2,
                                                                        background: '#FF0066',
                                                                        width: pct,
                                                                    }}
                                                                />
                                                            </div>
                                                            <span
                                                                style={{
                                                                    fontSize: 13,
                                                                    color: '#5C5C66',
                                                                    whiteSpace: 'nowrap',
                                                                    minWidth: 92,
                                                                }}
                                                            >
                                                                {used.toLocaleString()} / {limit.toLocaleString()}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td
                                                        data-l="Last portrait"
                                                        style={{
                                                            padding: '0 8px',
                                                            height: 60,
                                                            borderBottom: '1px solid #E3DFD8',
                                                            color: '#5C5C66',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {lastFormatted}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </>
    );
}
