'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthContext';
import {
    UserRole,
    GlobalSettings,
    ModelCostSetting,
    DEFAULT_MODEL_COSTS,
} from '@/types';
import { supabase } from '@/utils/supabase';

export default function SettingsPage() {
    const { user, isAuthenticated } = useAuth();
    const router = useRouter();

    const [settings, setSettings] = useState<GlobalSettings>({
        cloudinaryCloudName: '',
        cloudinaryApiKey: '',
        cloudinaryApiSecret: '',
        costSettings: [...DEFAULT_MODEL_COSTS],
    });
    const [projectsCount, setProjectsCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [saved, setSaved] = useState(false);
    const [locked, setLocked] = useState(true);
    const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
    const [removeModelIdx, setRemoveModelIdx] = useState<number | null>(null);
    const [toast, setToast] = useState('');

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => {
            setToast(prev => (prev === msg ? '' : prev));
        }, 3000);
    };

    useEffect(() => {
        if (!isAuthenticated || (user && user.role !== UserRole.ADMIN)) {
            if (user && user.role !== UserRole.ADMIN) router.replace('/');
            return;
        }
        fetchSettings();
    }, [isAuthenticated, user, router]);

    const fetchSettings = async () => {
        setIsLoading(true);
        try {
            const [{ data, error: fetchError }, { count }] = await Promise.all([
                supabase.from('global_settings').select('*').eq('id', 'current').single(),
                supabase.from('projects').select('id', { count: 'exact', head: true }),
            ]);

            if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

            setProjectsCount(count || 0);

            if (data) {
                const parsedCosts: ModelCostSetting[] =
                    Array.isArray(data.cost_settings) && data.cost_settings.length > 0
                        ? data.cost_settings
                        : [...DEFAULT_MODEL_COSTS];

                setSettings({
                    cloudinaryCloudName: data.cloudinary_cloud_name || '',
                    cloudinaryApiKey: data.cloudinary_api_key || '',
                    cloudinaryApiSecret: data.cloudinary_api_secret || '',
                    costSettings: parsedCosts,
                });
            }
        } catch (err) {
            console.error('Error fetching global settings:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const markDirty = () => {
        setDirty(true);
        setSaved(false);
    };

    const handleModelFieldChange = (
        index: number,
        field: keyof ModelCostSetting,
        value: string | number
    ) => {
        setSettings(prev => {
            const next = [...(prev.costSettings || [])];
            const current = { ...next[index] };
            if (field === 'modelName') {
                current.modelName = String(value);
                current.id = String(value) || current.id;
            } else if (
                field === 'promptOnly' ||
                field === 'ref1' ||
                field === 'ref2' ||
                field === 'ref3'
            ) {
                current[field] = Number(value) || 0;
            }
            next[index] = current;
            return { ...prev, costSettings: next };
        });
        markDirty();
    };

    const handleAddModel = () => {
        const nextNum = (settings.costSettings?.length || 0) + 1;
        setSettings(prev => ({
            ...prev,
            costSettings: [
                ...(prev.costSettings || []),
                {
                    id: `model-${Date.now()}`,
                    modelName: `model-${nextNum}`,
                    promptOnly: 0.04,
                    ref1: 0.06,
                    ref2: 0.08,
                    ref3: 0.1,
                },
            ],
        }));
        markDirty();
    };

    const handleConfirmRemoveModel = () => {
        if (removeModelIdx === null) return;
        setSettings(prev => ({
            ...prev,
            costSettings: (prev.costSettings || []).filter((_, idx) => idx !== removeModelIdx),
        }));
        setRemoveModelIdx(null);
        markDirty();
    };

    const handleTestConnection = async () => {
        setTestState('testing');
        try {
            const res = await fetch('/api/cloudinary/tags');
            if (res.ok) {
                setTestState('ok');
            } else {
                setTestState('fail');
            }
        } catch {
            setTestState('fail');
        }
        setTimeout(() => {
            setTestState('idle');
        }, 3000);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const payload: Record<string, unknown> = {
                cloudinary_cloud_name: settings.cloudinaryCloudName.trim(),
                cloudinary_api_key: settings.cloudinaryApiKey.trim(),
                cloudinary_api_secret: settings.cloudinaryApiSecret.trim(),
                cost_settings: settings.costSettings || [],
                updated_at: new Date().toISOString(),
            };

            let { error: saveError } = await supabase
                .from('global_settings')
                .update(payload)
                .eq('id', 'current');

            if (saveError && saveError.message?.includes('cost_settings')) {
                const fallbackPayload = {
                    cloudinary_cloud_name: settings.cloudinaryCloudName.trim(),
                    cloudinary_api_key: settings.cloudinaryApiKey.trim(),
                    cloudinary_api_secret: settings.cloudinaryApiSecret.trim(),
                    updated_at: new Date().toISOString(),
                };
                const retry = await supabase
                    .from('global_settings')
                    .update(fallbackPayload)
                    .eq('id', 'current');
                saveError = retry.error;
            }

            if (saveError) throw saveError;

            setDirty(false);
            setSaved(true);
            setLocked(true);
            showToast('Global settings saved');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Save failed';
            console.error('Error saving global settings:', err);
            showToast(msg);
        } finally {
            setIsSaving(false);
        }
    };

    if (!user || user.role !== UserRole.ADMIN) return null;

    const costRows = settings.costSettings || [];
    const testButtonLabel =
        testState === 'testing'
            ? 'Testing…'
            : testState === 'ok'
              ? 'Connected ✓'
              : testState === 'fail'
                ? 'Connection failed'
                : 'Test connection';

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
                maxWidth: 1080,
                width: '100%',
            }}
        >
            <header
                className="glow"
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    gap: 24,
                    marginBottom: 8,
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="lbl">
                        Applies to all {projectsCount} project{projectsCount === 1 ? '' : 's'}
                    </div>
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
                        Settings
                    </h1>
                </div>

                <button
                    type="button"
                    className="btn btn-pink"
                    disabled={!dirty || isSaving}
                    onClick={handleSave}
                >
                    {isSaving ? 'Saving…' : saved && !dirty ? 'Saved' : 'Save changes'}
                </button>
            </header>

            {isLoading ? (
                <div className="card emerge" style={{ padding: 48, textAlign: 'center', color: '#5C5C66' }}>
                    Loading settings…
                </div>
            ) : (
                <>
                    {/* 1. Cost settings */}
                    <section className="card emerge" aria-labelledby="cost-h">
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: 12,
                            }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <h2 id="cost-h" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                                    Cost settings
                                </h2>
                                <div
                                    style={{
                                        fontSize: 14,
                                        color: '#5C5C66',
                                        lineHeight: 1.5,
                                        maxWidth: 560,
                                    }}
                                >
                                    Price per portrait for each AI model, in US dollars. Each project picks a model and number of references, and its cost is worked out from here.
                                </div>
                            </div>

                            <button
                                type="button"
                                className="btn"
                                onClick={handleAddModel}
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
                                Add model
                            </button>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table
                                style={{
                                    width: '100%',
                                    minWidth: 720,
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
                                                padding: '0 8px 12px 0',
                                                fontWeight: 500,
                                                fontSize: 10,
                                                width: '28%',
                                            }}
                                        >
                                            AI model
                                        </th>
                                        <th
                                            scope="col"
                                            className="lbl"
                                            style={{
                                                padding: '0 8px 12px',
                                                fontWeight: 500,
                                                fontSize: 10,
                                            }}
                                        >
                                            Prompt only
                                        </th>
                                        <th
                                            scope="col"
                                            className="lbl"
                                            style={{
                                                padding: '0 8px 12px',
                                                fontWeight: 500,
                                                fontSize: 10,
                                            }}
                                        >
                                            +1 reference
                                        </th>
                                        <th
                                            scope="col"
                                            className="lbl"
                                            style={{
                                                padding: '0 8px 12px',
                                                fontWeight: 500,
                                                fontSize: 10,
                                            }}
                                        >
                                            +2 references
                                        </th>
                                        <th
                                            scope="col"
                                            className="lbl"
                                            style={{
                                                padding: '0 8px 12px',
                                                fontWeight: 500,
                                                fontSize: 10,
                                            }}
                                        >
                                            +3 references
                                        </th>
                                        <th
                                            scope="col"
                                            style={{ padding: '0 0 12px', width: 44 }}
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
                                                Remove
                                            </span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="stagger">
                                    {costRows.map((m, idx) => (
                                        <tr key={m.id || idx}>
                                            <td style={{ padding: '6px 8px 6px 0' }}>
                                                <input
                                                    className="field"
                                                    type="text"
                                                    placeholder="Model name"
                                                    aria-label={`Model name, row ${idx + 1}`}
                                                    value={m.modelName}
                                                    onChange={e =>
                                                        handleModelFieldChange(
                                                            idx,
                                                            'modelName',
                                                            e.target.value
                                                        )
                                                    }
                                                />
                                            </td>
                                            <td style={{ padding: '6px 8px' }}>
                                                <input
                                                    className="field"
                                                    type="number"
                                                    step="0.001"
                                                    min="0"
                                                    placeholder="$ 0.000"
                                                    aria-label={`Price prompt only, row ${idx + 1}`}
                                                    value={m.promptOnly}
                                                    onChange={e =>
                                                        handleModelFieldChange(
                                                            idx,
                                                            'promptOnly',
                                                            e.target.value
                                                        )
                                                    }
                                                />
                                            </td>
                                            <td style={{ padding: '6px 8px' }}>
                                                <input
                                                    className="field"
                                                    type="number"
                                                    step="0.001"
                                                    min="0"
                                                    placeholder="$ 0.000"
                                                    aria-label={`Price with 1 reference, row ${idx + 1}`}
                                                    value={m.ref1}
                                                    onChange={e =>
                                                        handleModelFieldChange(
                                                            idx,
                                                            'ref1',
                                                            e.target.value
                                                        )
                                                    }
                                                />
                                            </td>
                                            <td style={{ padding: '6px 8px' }}>
                                                <input
                                                    className="field"
                                                    type="number"
                                                    step="0.001"
                                                    min="0"
                                                    placeholder="$ 0.000"
                                                    aria-label={`Price with 2 references, row ${idx + 1}`}
                                                    value={m.ref2}
                                                    onChange={e =>
                                                        handleModelFieldChange(
                                                            idx,
                                                            'ref2',
                                                            e.target.value
                                                        )
                                                    }
                                                />
                                            </td>
                                            <td style={{ padding: '6px 8px' }}>
                                                <input
                                                    className="field"
                                                    type="number"
                                                    step="0.001"
                                                    min="0"
                                                    placeholder="$ 0.000"
                                                    aria-label={`Price with 3 references, row ${idx + 1}`}
                                                    value={m.ref3}
                                                    onChange={e =>
                                                        handleModelFieldChange(
                                                            idx,
                                                            'ref3',
                                                            e.target.value
                                                        )
                                                    }
                                                />
                                            </td>
                                            <td style={{ padding: '6px 0' }}>
                                                <button
                                                    type="button"
                                                    className="icon-btn danger"
                                                    aria-label={`Remove model row ${idx + 1}`}
                                                    title="Remove model"
                                                    onClick={() => setRemoveModelIdx(idx)}
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
                                                    >
                                                        <path d="M6 6l12 12M18 6L6 18"></path>
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ fontSize: 13, color: '#5C5C66' }}>
                            Changing a price affects cost reports for all projects using that model, from now on.
                        </div>
                    </section>

                    {/* 2. Image storage (Cloudinary) */}
                    <section className="card emerge" aria-labelledby="st-h">
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: 12,
                            }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <h2 id="st-h" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                                    Image storage
                                </h2>
                                <div style={{ fontSize: 14, color: '#5C5C66' }}>
                                    Where every booth saves its portraits (Cloudinary).
                                </div>
                            </div>

                            <span
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    fontSize: 13,
                                }}
                            >
                                <span
                                    className="live"
                                    aria-hidden="true"
                                    style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        background: '#3DDC97',
                                    }}
                                />
                                Connected
                            </span>
                        </div>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                gap: 16,
                            }}
                        >
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <span className="lbl" style={{ fontSize: 10 }}>
                                    Cloud name
                                </span>
                                <input
                                    className="field"
                                    type="text"
                                    value={settings.cloudinaryCloudName}
                                    readOnly={locked}
                                    onChange={e => {
                                        setSettings(prev => ({
                                            ...prev,
                                            cloudinaryCloudName: e.target.value,
                                        }));
                                        markDirty();
                                    }}
                                />
                            </label>

                            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <span className="lbl" style={{ fontSize: 10 }}>
                                    API key
                                </span>
                                <input
                                    className="field"
                                    type="password"
                                    value={settings.cloudinaryApiKey}
                                    readOnly={locked}
                                    onChange={e => {
                                        setSettings(prev => ({
                                            ...prev,
                                            cloudinaryApiKey: e.target.value,
                                        }));
                                        markDirty();
                                    }}
                                />
                            </label>

                            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <span className="lbl" style={{ fontSize: 10 }}>
                                    API secret
                                </span>
                                <input
                                    className="field"
                                    type="password"
                                    value={settings.cloudinaryApiSecret}
                                    readOnly={locked}
                                    onChange={e => {
                                        setSettings(prev => ({
                                            ...prev,
                                            cloudinaryApiSecret: e.target.value,
                                        }));
                                        markDirty();
                                    }}
                                />
                            </label>
                        </div>

                        {locked ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={handleTestConnection}
                                >
                                    {testButtonLabel}
                                </button>
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => setLocked(false)}
                                >
                                    Replace keys
                                </button>
                            </div>
                        ) : (
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 12,
                                    padding: '16px 20px',
                                    border: '1px solid #E8C4C9',
                                    borderRadius: 4,
                                }}
                            >
                                <div style={{ fontSize: 14, fontWeight: 600 }}>
                                    This changes storage for all {projectsCount} projects.
                                </div>
                                <div style={{ fontSize: 13, color: '#5C5C66', lineHeight: 1.5 }}>
                                    Running booths switch to the new account right away. Portraits already saved stay in the old one. Paste the new keys above, then save.
                                </div>
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => setLocked(true)}
                                    style={{ alignSelf: 'flex-start' }}
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </section>

                    <div style={{ fontSize: 13, color: '#5C5C66' }}>
                        Portrait limit, AI model and references are now set per project, on each project&apos;s page.
                    </div>
                </>
            )}

            {/* Remove Model Confirmation Dialog */}
            {removeModelIdx !== null && (
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
                        aria-labelledby="rmm-h"
                        style={{
                            width: '100%',
                            maxWidth: 460,
                            background: '#F7F5F2',
                            borderRadius: 4,
                            padding: 28,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16,
                        }}
                    >
                        <h2 id="rmm-h" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
                            Remove model {costRows[removeModelIdx]?.modelName || removeModelIdx + 1}?
                        </h2>
                        <div style={{ fontSize: 14, color: '#5C5C66', lineHeight: 1.5 }}>
                            Projects using this model will need a new one before their next portrait. Past cost reports keep the old prices.
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
                                onClick={() => setRemoveModelIdx(null)}
                            >
                                Keep it
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={handleConfirmRemoveModel}
                            >
                                Remove model
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
        </div>
    );
}
