'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import {
    Project,
    UserRole,
    User,
    ProjectPlatformType,
    CloudinaryAccount,
    DEFAULT_AI_MODELS,
    DEFAULT_OPERATOR_SETTINGS,
    ModelCostSetting,
    DEFAULT_MODEL_COSTS,
} from '@/types';
import { supabase } from '@/utils/supabase';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthContext';

type FilterChipId = 'all' | 'use' | 'done';
type SortMode = 'most' | 'least' | 'name';
type ViewMode = 'cards' | 'table';

function formatShortDate(dateInput?: string): string {
    if (!dateInput) return '—';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getProjectCategory(p: Project): {
    cat: 'use' | 'done';
    status: string;
    pill: string;
    dotCls: string;
    rule: string;
} {
    if (p.is_active === false || p.status === 'paused') {
        return {
            cat: 'done',
            status: 'Finished',
            pill: 'pill p-done',
            dotCls: '',
            rule: '#050507',
        };
    }
    return {
        cat: 'use',
        status: 'In use',
        pill: 'pill p-use',
        dotCls: 'live',
        rule: '#FF0066',
    };
}

function getPriceForModel(
    costSettings: ModelCostSetting[],
    modelName: string,
    refs: number
): number {
    const found =
        costSettings.find(c => c.modelName === modelName) ||
        costSettings[0] ||
        DEFAULT_MODEL_COSTS[0];
    if (!found) return 0.04;
    if (refs === 1) return found.ref1;
    if (refs === 2) return found.ref2;
    if (refs >= 3) return found.ref3;
    return found.promptOnly;
}

function ProjectsContent() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const router = useRouter();

    const [filter, setFilter] = useState<FilterChipId>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<SortMode>('most');
    const [viewMode, setViewMode] = useState<ViewMode>('cards');
    const [showModal, setShowModal] = useState(false);

    // Data state
    const [projects, setProjects] = useState<Project[]>([]);
    const [lastPortraitByProject, setLastPortraitByProject] = useState<Record<string, string>>({});
    const [users, setUsers] = useState<User[]>([]);
    const [costSettings, setCostSettings] = useState<ModelCostSetting[]>(DEFAULT_MODEL_COSTS);
    const [cloudinaryAccounts, setCloudinaryAccounts] = useState<CloudinaryAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [teamSearch, setTeamSearch] = useState('');

    // New Project Form State
    const [newProject, setNewProject] = useState({
        name: '',
        description: '',
        eventDate: '',
        dailyLimit: 1000,
        projectType: 'desktop' as ProjectPlatformType,
        enablePrinting: true,
        selectedAiModel: DEFAULT_OPERATOR_SETTINGS.openaiModel,
        referenceImagesCount: 1,
        assignedUserIds: [] as string[],
        cloudinaryAccountId: '',
        cloudinaryTag: '',
    });

    useEffect(() => {
        if (searchParams.get('new') === '1' && user?.role === UserRole.ADMIN) {
            setShowModal(true);
        }
    }, [searchParams, user]);

    useEffect(() => {
        if (user) {
            fetchData();
        }
    }, [user]);

    const fetchData = async () => {
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

            const { data: projectsData, error: pError } = await projectsQuery.order('created_at', {
                ascending: false,
            });

            if (pError) throw pError;

            // Fetch Cloudinary Accounts
            const { data: accData } = await supabase
                .from('cloudinary_accounts')
                .select('*')
                .order('is_default', { ascending: false })
                .order('created_at', { ascending: true });

            const mappedAccs: CloudinaryAccount[] = (accData || []).map(a => ({
                id: a.id,
                label: a.label,
                cloudName: a.cloud_name,
                apiKey: a.api_key,
                apiSecret: a.api_secret,
                isDefault: Boolean(a.is_default),
            }));
            setCloudinaryAccounts(mappedAccs);

            const defaultAcc = mappedAccs.find(a => a.isDefault) || mappedAccs[0];
            if (defaultAcc) {
                setNewProject(prev => ({
                    ...prev,
                    cloudinaryAccountId: prev.cloudinaryAccountId || defaultAcc.id,
                }));
            }

            const mappedProjects: Project[] = (projectsData || []).map(p => {
                const linkedAcc =
                    (p.cloudinary_account_id
                        ? mappedAccs.find(a => a.id === p.cloudinary_account_id)
                        : null) ||
                    defaultAcc ||
                    null;

                return {
                    id: p.id,
                    name: p.name,
                    description: p.description || '',
                    dailyLimit: p.max_usage || 1000,
                    currentGenerations: p.total_usage || 0,
                    createdAt: p.created_at,
                    ownerId: p.created_by || '',
                    is_active: p.is_active !== false,
                    status: p.is_active === false ? 'paused' : 'active',
                    projectType: (p.project_type as ProjectPlatformType) || 'desktop',
                    enablePrinting: typeof p.enable_printing === 'boolean' ? p.enable_printing : true,
                    totalPrintedCopies: p.total_printed_copies || 0,
                    selectedAiModel: p.selected_ai_model || 'gpt-image-2.6-flare',
                    referenceImagesCount:
                        typeof p.reference_images_count === 'number' ? p.reference_images_count : 0,
                    aiModelsList: Array.isArray(p.ai_models_list)
                        ? p.ai_models_list
                        : [...DEFAULT_AI_MODELS],
                    cloudinaryAccountId: p.cloudinary_account_id || linkedAcc?.id || null,
                    cloudinaryCloudName: linkedAcc?.cloudName || '',
                    cloudinaryTag: p.cloudinary_folder || p.cloudinary_tag,
                    cloudinaryFolder: p.cloudinary_folder || p.cloudinary_tag,
                };
            });

            setProjects(mappedProjects);

            // Fetch latest usage log per project for "Last portrait"
            const projectIds = mappedProjects.map(p => p.id);
            if (projectIds.length > 0) {
                const { data: logsData } = await supabase
                    .from('usage_logs')
                    .select('project_id, timestamp')
                    .in('project_id', projectIds)
                    .order('timestamp', { ascending: false });

                const lastMap: Record<string, string> = {};
                for (const l of logsData || []) {
                    if (!lastMap[l.project_id]) {
                        lastMap[l.project_id] = l.timestamp;
                    }
                }
                setLastPortraitByProject(lastMap);
            }

            // Fetch Global Cost Settings
            const { data: globalData } = await supabase
                .from('global_settings')
                .select('cost_settings')
                .eq('id', 'current')
                .single();

            if (globalData && Array.isArray(globalData.cost_settings) && globalData.cost_settings.length > 0) {
                setCostSettings(globalData.cost_settings);
            }

            // Fetch Users (for assignment)
            if (user?.role === UserRole.ADMIN) {
                const { data: userData } = await supabase
                    .from('profiles')
                    .select('*')
                    .order('full_name', { ascending: true });

                setUsers(
                    (userData || []).map(u => ({
                        id: u.id,
                        name: u.full_name || u.email,
                        email: u.email,
                        role: u.role as UserRole,
                        assignedProjectIds: [],
                    }))
                );
            }
        } catch (err) {
            console.error('Error fetching projects data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const computedFolder = useMemo(() => {
        if (newProject.cloudinaryTag.trim()) {
            return newProject.cloudinaryTag.trim().replace(/\s+/g, '-');
        }
        const trimmed = newProject.name.trim();
        return trimmed ? trimmed.replace(/\s+/g, '-') : '[project-name]';
    }, [newProject.name, newProject.cloudinaryTag]);

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProject.name.trim()) return;
        setIsSaving(true);

        try {
            const folderTag =
                newProject.cloudinaryTag.trim() ||
                newProject.name.trim().replace(/\s+/g, '-');

            const modelList = Array.from(
                new Set([
                    ...costSettings.map(c => c.modelName).filter(Boolean),
                    ...DEFAULT_AI_MODELS,
                ])
            );

            const chosenAccount =
                cloudinaryAccounts.find(a => a.id === newProject.cloudinaryAccountId) ||
                cloudinaryAccounts.find(a => a.isDefault) ||
                cloudinaryAccounts[0] ||
                null;

            const {
                cloudinaryCloudName: _c1,
                cloudinaryApiKey: _c2,
                cloudinaryApiSecret: _c3,
                ...cleanDefaultOperatorSettings
            } = DEFAULT_OPERATOR_SETTINGS;

            const projectData: Record<string, unknown> = {
                name: newProject.name.trim(),
                description: newProject.description.trim(),
                max_usage: newProject.dailyLimit || 1000,
                project_type: newProject.projectType,
                enable_printing:
                    newProject.projectType === 'web' ? false : newProject.enablePrinting,
                cloudinary_account_id: chosenAccount?.id || null,
                cloudinary_tag: folderTag,
                cloudinary_folder: folderTag,
                ai_models_list: modelList,
                selected_ai_model: newProject.selectedAiModel,
                reference_images_count: newProject.referenceImagesCount,
                operator_settings: {
                    ...cleanDefaultOperatorSettings,
                    openaiModel: newProject.selectedAiModel,
                    aiModelsList: modelList,
                    cloudinaryFolder: folderTag,
                    enablePrinting:
                        newProject.projectType === 'web' ? false : newProject.enablePrinting,
                },
                created_by: user?.id,
                is_active: true,
            };

            let { data: createdProject, error: pError } = await supabase
                .from('projects')
                .insert([projectData])
                .select()
                .single();

            // Fallback if newest migration columns aren't applied yet
            if (pError && pError.message?.includes('column')) {
                const fallbackData: Record<string, unknown> = {
                    name: newProject.name.trim(),
                    description: newProject.description.trim(),
                    max_usage: newProject.dailyLimit || 1000,
                    project_type: newProject.projectType,
                    enable_printing:
                        newProject.projectType === 'web' ? false : newProject.enablePrinting,
                    cloudinary_tag: folderTag,
                    cloudinary_folder: folderTag,
                    ai_models_list: modelList,
                    selected_ai_model: newProject.selectedAiModel,
                    operator_settings: {
                        ...DEFAULT_OPERATOR_SETTINGS,
                        openaiModel: newProject.selectedAiModel,
                        aiModelsList: modelList,
                        cloudinaryFolder: folderTag,
                        enablePrinting:
                            newProject.projectType === 'web' ? false : newProject.enablePrinting,
                    },
                    created_by: user?.id,
                    is_active: true,
                };
                const retry = await supabase
                    .from('projects')
                    .insert([fallbackData])
                    .select()
                    .single();
                createdProject = retry.data;
                pError = retry.error;
            }

            if (pError) throw pError;

            if (newProject.assignedUserIds.length > 0 && createdProject) {
                const memberData = newProject.assignedUserIds.map(userId => ({
                    project_id: createdProject.id,
                    user_id: userId,
                }));
                await supabase.from('project_members').insert(memberData);
            }

            await fetchData();
            setShowModal(false);
            const defaultAcc =
                cloudinaryAccounts.find(a => a.isDefault) || cloudinaryAccounts[0];
            setNewProject({
                name: '',
                description: '',
                eventDate: '',
                dailyLimit: 1000,
                projectType: 'desktop',
                enablePrinting: true,
                selectedAiModel: costSettings[0]?.modelName || DEFAULT_OPERATOR_SETTINGS.openaiModel,
                referenceImagesCount: 1,
                assignedUserIds: [],
                cloudinaryAccountId: defaultAcc?.id || '',
                cloudinaryTag: '',
            });
            if (createdProject?.id) {
                router.push(`/projects/${createdProject.id}`);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error('Error creating project:', err);
            alert(`Project creation failed: ${message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const counts = useMemo(() => {
        const res = { all: projects.length, use: 0, done: 0 };
        for (const p of projects) {
            const c = getProjectCategory(p).cat;
            res[c]++;
        }
        return res;
    }, [projects]);

    const filteredAndSorted = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        const list = projects.filter(p => {
            const cat = getProjectCategory(p).cat;
            if (filter !== 'all' && cat !== filter) return false;
            if (
                q &&
                !p.name.toLowerCase().includes(q) &&
                !(p.description || '').toLowerCase().includes(q)
            ) {
                return false;
            }
            return true;
        });

        list.sort((a, b) => {
            if (sortBy === 'most') {
                return (b.currentGenerations || 0) - (a.currentGenerations || 0);
            }
            if (sortBy === 'least') {
                return (a.currentGenerations || 0) - (b.currentGenerations || 0);
            }
            return a.name.localeCompare(b.name);
        });

        return list;
    }, [projects, filter, searchTerm, sortBy]);

    if (!user) return null;

    const isAdmin = user.role === UserRole.ADMIN;

    const filterChips: {
        id: FilterChipId;
        label: string;
        count: number;
        dot: string;
        activeBg: string;
        activeBorder: string;
        activeColor: string;
    }[] = [
        {
            id: 'all',
            label: 'All',
            count: counts.all,
            dot: '#FF0066',
            activeBg: '#FFE8F1',
            activeBorder: '#FF0066',
            activeColor: '#B8004A',
        },
        {
            id: 'use',
            label: 'In use',
            count: counts.use,
            dot: '#3DDC97',
            activeBg: '#E3F9EF',
            activeBorder: '#0B7A4B',
            activeColor: '#0B7A4B',
        },
        {
            id: 'done',
            label: 'Finished',
            count: counts.done,
            dot: '#FF0066',
            activeBg: '#050507',
            activeBorder: '#050507',
            activeColor: '#F7F5F2',
        },
    ];

    const headLabel = isAdmin
        ? `${counts.all} projects · ${counts.use} in use · ${counts.done} finished`
        : `Projects you're added to · ${counts.all}`;

    const unitPrice = getPriceForModel(
        costSettings,
        newProject.selectedAiModel,
        newProject.referenceImagesCount
    );
    const fullLimitPrice = unitPrice * (newProject.dailyLimit || 1000);

    const assignableUsers = users.filter(
        u =>
            u.role === UserRole.REGULAR &&
            (!teamSearch.trim() ||
                u.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
                u.email.toLowerCase().includes(teamSearch.toLowerCase()))
    );

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
                    <div className="lbl">{headLabel}</div>
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
                        Projects
                    </h1>
                </div>

                {isAdmin && (
                    <button
                        type="button"
                        className="btn btn-pink"
                        onClick={() => setShowModal(true)}
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
                        New project
                    </button>
                )}
            </header>

            {/* Toolbar */}
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 16,
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                }}
            >
                <div
                    role="group"
                    aria-label="Filter projects"
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

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span className="lbl" style={{ fontSize: 10 }}>
                            Search
                        </span>
                        <input
                            className="field"
                            type="search"
                            placeholder="Project name"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ width: 240 }}
                        />
                    </label>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span className="lbl" style={{ fontSize: 10 }}>
                            Sort by
                        </span>
                        <select
                            className="field"
                            style={{ width: 200 }}
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value as SortMode)}
                        >
                            <option value="most">Most portraits</option>
                            <option value="least">Fewest portraits</option>
                            <option value="name">Name A–Z</option>
                        </select>
                    </label>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span className="lbl" style={{ fontSize: 10 }} id="view-l">
                            View
                        </span>
                        <div
                            role="group"
                            aria-labelledby="view-l"
                            style={{
                                display: 'flex',
                                gap: 4,
                                padding: 2,
                                border: '1px solid #CFCAC1',
                                borderRadius: 4,
                                background: '#F7F5F2',
                            }}
                        >
                            <button
                                type="button"
                                className={`vbtn${viewMode === 'cards' ? ' on' : ''}`}
                                aria-pressed={viewMode === 'cards'}
                                onClick={() => setViewMode('cards')}
                            >
                                <svg
                                    aria-hidden="true"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinejoin="round"
                                >
                                    <rect x="4" y="4" width="7" height="7" rx="1"></rect>
                                    <rect x="13" y="4" width="7" height="7" rx="1"></rect>
                                    <rect x="4" y="13" width="7" height="7" rx="1"></rect>
                                    <rect x="13" y="13" width="7" height="7" rx="1"></rect>
                                </svg>
                                Cards
                            </button>
                            <button
                                type="button"
                                className={`vbtn${viewMode === 'table' ? ' on' : ''}`}
                                aria-pressed={viewMode === 'table'}
                                onClick={() => setViewMode('table')}
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
                                >
                                    <path d="M4 6h16M4 12h16M4 18h16"></path>
                                </svg>
                                Table
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            {isLoading ? (
                <div
                    className="card emerge"
                    style={{
                        padding: '48px 24px',
                        alignItems: 'center',
                        textAlign: 'center',
                        color: '#5C5C66',
                    }}
                >
                    Loading projects…
                </div>
            ) : viewMode === 'cards' ? (
                <>
                    {filteredAndSorted.length > 0 ? (
                        <section
                            aria-label="Project cards"
                            className="stagger"
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                                gap: 16,
                            }}
                        >
                            {filteredAndSorted.map(p => {
                                const info = getProjectCategory(p);
                                const used = p.currentGenerations || 0;
                                const limit = Math.max(1, p.dailyLimit || 1000);
                                const pctNum = Math.min(100, Math.round((used / limit) * 100));
                                const lastStr =
                                    used > 0 && lastPortraitByProject[p.id]
                                        ? formatShortDate(lastPortraitByProject[p.id])
                                        : used > 0
                                          ? formatShortDate(p.createdAt)
                                          : '—';

                                return (
                                    <Link
                                        key={p.id}
                                        className="pcard lift"
                                        href={`/projects/${p.id}`}
                                        aria-label={`Open ${p.name}`}
                                    >
                                        <div
                                            aria-hidden="true"
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                height: 2,
                                                background: info.rule,
                                            }}
                                        />
                                        <div
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                gap: 8,
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                <span className={info.pill}>
                                                    <i className={info.dotCls} aria-hidden="true"></i>
                                                    {info.status}
                                                </span>
                                                <span
                                                    className="pill p-gray"
                                                    style={{ fontSize: 10, padding: '2px 8px', textTransform: 'uppercase' }}
                                                >
                                                    {p.projectType === 'web' ? 'Web' : 'Desktop'}
                                                </span>
                                            </div>
                                            <svg
                                                className="go"
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
                                                <path d="M5 12h14M13 6l6 6-6 6"></path>
                                            </svg>
                                        </div>

                                        <div
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 4,
                                                minHeight: 40,
                                            }}
                                        >
                                            <span
                                                className="pname"
                                                style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}
                                            >
                                                {p.name}
                                            </span>
                                            {p.description && (
                                                <span
                                                    style={{
                                                        fontSize: 12,
                                                        color: '#5C5C66',
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: 'vertical',
                                                        overflow: 'hidden',
                                                    }}
                                                >
                                                    {p.description}
                                                </span>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    fontSize: 12,
                                                }}
                                            >
                                                <span style={{ fontWeight: 600 }}>
                                                    {used.toLocaleString()} / {limit.toLocaleString()}
                                                </span>
                                                <span style={{ color: '#5C5C66' }}>{pctNum}% used</span>
                                            </div>
                                            <div
                                                style={{
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
                                                        width: `${pctNum}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                fontSize: 12,
                                                color: '#5C5C66',
                                                borderTop: '1px solid #E3DFD8',
                                                paddingTop: 12,
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                gap: 8,
                                            }}
                                        >
                                            <span>Last portrait · {lastStr}</span>
                                            {p.projectType !== 'web' && p.enablePrinting && (
                                                <span title="Total printed copies" style={{ fontWeight: 600 }}>
                                                    {(p.totalPrintedCopies || 0).toLocaleString()} printed
                                                </span>
                                            )}
                                        </div>
                                    </Link>
                                );
                            })}
                        </section>
                    ) : (
                        <div
                            style={{
                                padding: '48px 24px',
                                textAlign: 'center',
                                color: '#5C5C66',
                                fontSize: 14,
                                border: '1px dashed #CFCAC1',
                                borderRadius: 4,
                            }}
                        >
                            No projects match. Try another name or filter.
                        </div>
                    )}
                </>
            ) : (
                <section
                    className="emerge"
                    aria-label="Project list"
                    style={{
                        background: '#F7F5F2',
                        border: '1px solid #E3DFD8',
                        borderRadius: 4,
                        overflowX: 'auto',
                    }}
                >
                    <table
                        className="rtable"
                        style={{
                            width: '100%',
                            minWidth: 760,
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
                                    Project
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
                                        width: '30%',
                                    }}
                                >
                                    Portraits used
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
                                    Last portrait
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
                            {filteredAndSorted.map(p => {
                                const info = getProjectCategory(p);
                                const used = p.currentGenerations || 0;
                                const limit = Math.max(1, p.dailyLimit || 1000);
                                const pctNum = Math.min(100, Math.round((used / limit) * 100));
                                const lastStr =
                                    used > 0 && lastPortraitByProject[p.id]
                                        ? formatShortDate(lastPortraitByProject[p.id])
                                        : used > 0
                                          ? formatShortDate(p.createdAt)
                                          : '—';

                                return (
                                    <tr key={p.id}>
                                        <td
                                            style={{
                                                padding: '0 24px',
                                                height: 64,
                                                borderBottom: '1px solid #E3DFD8',
                                            }}
                                        >
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                <Link
                                                    className="row-link"
                                                    href={`/projects/${p.id}`}
                                                    title={p.name}
                                                    style={{
                                                        display: 'block',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        maxWidth: 360,
                                                    }}
                                                >
                                                    {p.name}
                                                </Link>
                                                {p.description && (
                                                    <span
                                                        style={{
                                                            fontSize: 12,
                                                            color: '#5C5C66',
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            maxWidth: 360,
                                                        }}
                                                    >
                                                        {p.description}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td
                                            data-l="Status"
                                            style={{
                                                padding: '0 8px',
                                                height: 64,
                                                borderBottom: '1px solid #E3DFD8',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            <span className={info.pill}>
                                                <i className={info.dotCls} aria-hidden="true"></i>
                                                {info.status}
                                            </span>
                                        </td>
                                        <td
                                            data-l="Used"
                                            style={{
                                                padding: '0 8px',
                                                height: 64,
                                                borderBottom: '1px solid #E3DFD8',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                                                            width: `${pctNum}%`,
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
                                                padding: '14px 8px',
                                                borderBottom: '1px solid #E3DFD8',
                                                color: '#5C5C66',
                                            }}
                                        >
                                            {lastStr}
                                        </td>
                                        <td
                                            className="hide-m"
                                            style={{
                                                padding: '14px 24px',
                                                borderBottom: '1px solid #E3DFD8',
                                                textAlign: 'right',
                                            }}
                                        >
                                            <Link
                                                className="icon-btn"
                                                href={`/projects/${p.id}`}
                                                aria-label={`Open ${p.name}`}
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
                                                    <path d="M9 6l6 6-6 6"></path>
                                                </svg>
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filteredAndSorted.length === 0 && (
                        <div
                            style={{
                                padding: '48px 24px',
                                textAlign: 'center',
                                color: '#5C5C66',
                                fontSize: 14,
                            }}
                        >
                            No projects match. Try another name or filter.
                        </div>
                    )}
                </section>
            )}

            {/* New Project Modal ("Set up a booth") */}
            {showModal && (
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
                    onClick={e => {
                        if (e.target === e.currentTarget) setShowModal(false);
                    }}
                >
                    <form
                        onSubmit={handleCreateProject}
                        className="emerge"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="new-proj-h"
                        style={{
                            width: '100%',
                            maxWidth: 820,
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            boxSizing: 'border-box',
                            background: '#EFECE6',
                            border: '1px solid #E3DFD8',
                            borderRadius: 4,
                            padding: 28,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 20,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: 16,
                            }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div className="lbl">New project</div>
                                <h2
                                    id="new-proj-h"
                                    style={{
                                        margin: 0,
                                        fontSize: 'clamp(24px, 3vw, 34px)',
                                        fontWeight: 300,
                                        letterSpacing: '.04em',
                                        textTransform: 'uppercase',
                                        lineHeight: 1.1,
                                    }}
                                >
                                    Set up a booth
                                </h2>
                            </div>
                            <button
                                type="button"
                                className="icon-btn"
                                aria-label="Close dialog"
                                onClick={() => setShowModal(false)}
                            >
                                <svg
                                    aria-hidden="true"
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                >
                                    <path d="M6 6l12 12M18 6L6 18"></path>
                                </svg>
                            </button>
                        </div>

                        {/* Section 1: The event */}
                        <section
                            style={{
                                background: '#F7F5F2',
                                border: '1px solid #E3DFD8',
                                borderRadius: 4,
                                padding: 20,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 16,
                            }}
                        >
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>The event</h3>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                    gap: 16,
                                }}
                            >
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <span className="lbl" style={{ fontSize: 10 }}>
                                        Project name *
                                    </span>
                                    <input
                                        className="field"
                                        type="text"
                                        placeholder="e.g. Ramadan-2027"
                                        value={newProject.name}
                                        onChange={e =>
                                            setNewProject(prev => ({ ...prev, name: e.target.value }))
                                        }
                                        required
                                    />
                                </label>

                                <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <span className="lbl" style={{ fontSize: 10 }}>
                                        Client / Description
                                    </span>
                                    <input
                                        className="field"
                                        type="text"
                                        placeholder="Client or event note"
                                        value={newProject.description}
                                        onChange={e =>
                                            setNewProject(prev => ({ ...prev, description: e.target.value }))
                                        }
                                    />
                                </label>

                                <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <span className="lbl" style={{ fontSize: 10 }}>
                                        Portrait limit
                                    </span>
                                    <input
                                        className="field"
                                        type="number"
                                        min={1}
                                        value={newProject.dailyLimit}
                                        onChange={e =>
                                            setNewProject(prev => ({
                                                ...prev,
                                                dailyLimit: parseInt(e.target.value, 10) || 1000,
                                            }))
                                        }
                                    />
                                </label>

                                <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <span className="lbl" style={{ fontSize: 10 }}>
                                        Platform type
                                    </span>
                                    <select
                                        className="field"
                                        value={newProject.projectType}
                                        onChange={e => {
                                            const pt = e.target.value as ProjectPlatformType;
                                            setNewProject(prev => ({
                                                ...prev,
                                                projectType: pt,
                                                enablePrinting: pt === 'desktop',
                                            }));
                                        }}
                                    >
                                        <option value="desktop">Desktop App (Kiosk)</option>
                                        <option value="web">Web Project</option>
                                    </select>
                                </label>
                            </div>

                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                    gap: 16,
                                    alignItems: 'end',
                                }}
                            >
                                {cloudinaryAccounts.length > 0 && (
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <span className="lbl" style={{ fontSize: 10 }}>
                                            Cloudinary account
                                        </span>
                                        <select
                                            className="field"
                                            value={newProject.cloudinaryAccountId}
                                            onChange={e =>
                                                setNewProject(prev => ({
                                                    ...prev,
                                                    cloudinaryAccountId: e.target.value,
                                                }))
                                            }
                                        >
                                            {cloudinaryAccounts.map(acc => (
                                                <option key={acc.id} value={acc.id}>
                                                    {acc.label} ({acc.cloudName})
                                                    {acc.isDefault ? ' · Default' : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                )}

                                <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <span className="lbl" style={{ fontSize: 10 }}>
                                        Cloudinary folder / tag (optional override)
                                    </span>
                                    <input
                                        className="field"
                                        type="text"
                                        placeholder={computedFolder}
                                        value={newProject.cloudinaryTag}
                                        onChange={e =>
                                            setNewProject(prev => ({
                                                ...prev,
                                                cloudinaryTag: e.target.value,
                                            }))
                                        }
                                    />
                                </label>

                                {newProject.projectType === 'desktop' && (
                                    <label
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            fontSize: 14,
                                            minHeight: 44,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={newProject.enablePrinting}
                                            onChange={e =>
                                                setNewProject(prev => ({
                                                    ...prev,
                                                    enablePrinting: e.target.checked,
                                                }))
                                            }
                                            style={{ width: 18, height: 18, accentColor: '#FF0066' }}
                                        />
                                        Printing enabled on booth
                                    </label>
                                )}
                            </div>

                            <div style={{ fontSize: 13, color: '#5C5C66' }}>
                                The image folder is created from the name:{' '}
                                <b style={{ color: '#050507' }}>{computedFolder}</b>
                            </div>
                        </section>

                        {/* Section 2: AI model & cost */}
                        <section
                            style={{
                                background: '#F7F5F2',
                                border: '1px solid #E3DFD8',
                                borderRadius: 4,
                                padding: 20,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 16,
                            }}
                        >
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>AI model &amp; cost</h3>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                    gap: 16,
                                }}
                            >
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <span className="lbl" style={{ fontSize: 10 }}>
                                        AI model
                                    </span>
                                    <select
                                        className="field"
                                        value={newProject.selectedAiModel}
                                        onChange={e =>
                                            setNewProject(prev => ({
                                                ...prev,
                                                selectedAiModel: e.target.value,
                                            }))
                                        }
                                    >
                                        {costSettings.map(m => (
                                            <option key={m.id || m.modelName} value={m.modelName}>
                                                {m.modelName}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <span className="lbl" style={{ fontSize: 10 }}>
                                        Reference images
                                    </span>
                                    <select
                                        className="field"
                                        value={newProject.referenceImagesCount}
                                        onChange={e =>
                                            setNewProject(prev => ({
                                                ...prev,
                                                referenceImagesCount: parseInt(e.target.value, 10) || 0,
                                            }))
                                        }
                                    >
                                        <option value={0}>None · prompt only</option>
                                        <option value={1}>1 reference</option>
                                        <option value={2}>2 references</option>
                                        <option value={3}>3 references</option>
                                    </select>
                                </label>
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 32,
                                    padding: '16px 20px',
                                    background: '#EFECE6',
                                    borderRadius: 4,
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <span className="lbl" style={{ fontSize: 10 }}>
                                        Price per portrait
                                    </span>
                                    <span style={{ fontSize: 22, fontWeight: 300 }}>
                                        ${unitPrice.toFixed(3)}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <span className="lbl" style={{ fontSize: 10 }}>
                                        At full limit ({(newProject.dailyLimit || 1000).toLocaleString()})
                                    </span>
                                    <span style={{ fontSize: 22, fontWeight: 300 }}>
                                        ${fullLimitPrice.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </section>

                        {/* Section 3: Team */}
                        <section
                            style={{
                                background: '#F7F5F2',
                                border: '1px solid #E3DFD8',
                                borderRadius: 4,
                                padding: 20,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 16,
                            }}
                        >
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Team</h3>
                            <label
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 8,
                                    maxWidth: 420,
                                }}
                            >
                                <span className="lbl" style={{ fontSize: 10 }}>
                                    Add people (optional)
                                </span>
                                <input
                                    className="field"
                                    type="search"
                                    placeholder="Search by name or email"
                                    value={teamSearch}
                                    onChange={e => setTeamSearch(e.target.value)}
                                />
                            </label>

                            {assignableUsers.length > 0 && (
                                <div
                                    style={{
                                        maxHeight: 160,
                                        overflowY: 'auto',
                                        border: '1px solid #E3DFD8',
                                        borderRadius: 4,
                                        background: '#EFECE6',
                                        padding: 6,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 2,
                                    }}
                                >
                                    {assignableUsers.map(u => {
                                        const isSelected = newProject.assignedUserIds.includes(u.id);
                                        return (
                                            <label
                                                key={u.id}
                                                className={`mopt${isSelected ? ' on' : ''}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() =>
                                                        setNewProject(prev => ({
                                                            ...prev,
                                                            assignedUserIds: isSelected
                                                                ? prev.assignedUserIds.filter(
                                                                      id => id !== u.id
                                                                  )
                                                                : [...prev.assignedUserIds, u.id],
                                                        }))
                                                    }
                                                />
                                                <span style={{ flex: 1, fontWeight: 600 }}>{u.name}</span>
                                                <span style={{ fontSize: 12, color: '#5C5C66' }}>
                                                    {u.email}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                            <button
                                type="submit"
                                className="btn btn-pink"
                                disabled={!newProject.name.trim() || isSaving}
                            >
                                {isSaving ? 'Creating…' : 'Create project'}
                            </button>
                            {!newProject.name.trim() && (
                                <span style={{ fontSize: 13, color: '#5C5C66' }}>
                                    Add a project name to continue.
                                </span>
                            )}
                            <button
                                type="button"
                                className="btn"
                                onClick={() => setShowModal(false)}
                                style={{ marginLeft: 'auto' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </>
    );
}

export default function ProjectListPage() {
    return (
        <Suspense
            fallback={
                <div className="card emerge" style={{ padding: 48, textAlign: 'center', color: '#5C5C66' }}>
                    Loading projects…
                </div>
            }
        >
            <ProjectsContent />
        </Suspense>
    );
}
