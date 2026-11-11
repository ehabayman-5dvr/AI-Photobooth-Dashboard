'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Plus, Trash2, Check } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import {
    UserRole,
    CloudinaryAccount,
    ModelCostSetting,
    DEFAULT_MODEL_COSTS,
} from '@/types';
import { supabase } from '@/utils/supabase';

interface AccountFormState {
    label: string;
    cloudName: string;
    apiKey: string;
    apiSecret: string;
    isDefault: boolean;
}

const EMPTY_ACCOUNT_FORM: AccountFormState = {
    label: '',
    cloudName: '',
    apiKey: '',
    apiSecret: '',
    isDefault: false,
};

export default function SettingsPage() {
    const { user, isAuthenticated } = useAuth();
    const router = useRouter();

    const [costSettings, setCostSettings] = useState<ModelCostSetting[]>([
        ...DEFAULT_MODEL_COSTS,
    ]);
    const [accounts, setAccounts] = useState<CloudinaryAccount[]>([]);
    const [usageByAccount, setUsageByAccount] = useState<Record<string, number>>({});
    const [unassignedProjectsCount, setUnassignedProjectsCount] = useState(0);
    const [projectsCount, setProjectsCount] = useState(0);
    const [migrationMissing, setMigrationMissing] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [saved, setSaved] = useState(false);
    const [removeModelIdx, setRemoveModelIdx] = useState<number | null>(null);

    // Cloudinary Accounts CRUD state
    const [isAddingAccount, setIsAddingAccount] = useState(false);
    const [newAccountForm, setNewAccountForm] = useState<AccountFormState>(EMPTY_ACCOUNT_FORM);
    const [showNewSecret, setShowNewSecret] = useState(false);
    const [isSavingAccount, setIsSavingAccount] = useState(false);

    const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
    const [editAccountForm, setEditAccountForm] = useState<AccountFormState>(EMPTY_ACCOUNT_FORM);
    const [showEditSecret, setShowEditSecret] = useState(false);

    const [deleteTargetAccount, setDeleteTargetAccount] = useState<CloudinaryAccount | null>(null);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);

    const [testStates, setTestStates] = useState<
        Record<string, { status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string }>
    >({});

    const [toast, setToast] = useState('');

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => {
            setToast(prev => (prev === msg ? '' : prev));
        }, 3200);
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
            const [gsRes, projRes, accRes] = await Promise.all([
                supabase.from('global_settings').select('*').eq('id', 'current').single(),
                supabase.from('projects').select('*'),
                supabase
                    .from('cloudinary_accounts')
                    .select('*')
                    .order('is_default', { ascending: false })
                    .order('created_at', { ascending: true }),
            ]);

            if (gsRes.data) {
                const parsedCosts: ModelCostSetting[] =
                    Array.isArray(gsRes.data.cost_settings) && gsRes.data.cost_settings.length > 0
                        ? gsRes.data.cost_settings
                        : [...DEFAULT_MODEL_COSTS];
                setCostSettings(parsedCosts);
            }

            const projectRows = projRes.data || [];
            setProjectsCount(projectRows.length);

            const countMap: Record<string, number> = {};
            let unassigned = 0;
            for (const p of projectRows) {
                if (p.cloudinary_account_id) {
                    countMap[p.cloudinary_account_id] =
                        (countMap[p.cloudinary_account_id] || 0) + 1;
                } else {
                    unassigned++;
                }
            }
            setUsageByAccount(countMap);
            setUnassignedProjectsCount(unassigned);

            if (
                accRes.error &&
                (accRes.error.code === '42P01' ||
                    accRes.error.code === 'PGRST205' ||
                    accRes.error.message?.includes('cloudinary_accounts'))
            ) {
                setMigrationMissing(true);
                setAccounts([]);
            } else if (accRes.error) {
                throw accRes.error;
            } else {
                setMigrationMissing(false);
                const mappedAccounts: CloudinaryAccount[] = (accRes.data || []).map(a => ({
                    id: a.id,
                    label: a.label,
                    cloudName: a.cloud_name,
                    apiKey: a.api_key,
                    apiSecret: a.api_secret,
                    isDefault: Boolean(a.is_default),
                    createdAt: a.created_at,
                    updatedAt: a.updated_at,
                }));
                setAccounts(mappedAccounts);
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
        setCostSettings(prev => {
            const next = [...prev];
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
            return next;
        });
        markDirty();
    };

    const handleAddModel = () => {
        const nextNum = costSettings.length + 1;
        setCostSettings(prev => [
            ...prev,
            {
                id: `model-${Date.now()}`,
                modelName: `model-${nextNum}`,
                promptOnly: 0.04,
                ref1: 0.06,
                ref2: 0.08,
                ref3: 0.1,
            },
        ]);
        markDirty();
    };

    const handleConfirmRemoveModel = () => {
        if (removeModelIdx === null) return;
        setCostSettings(prev => prev.filter((_, idx) => idx !== removeModelIdx));
        setRemoveModelIdx(null);
        markDirty();
    };

    const handleSaveCostSettings = async () => {
        setIsSaving(true);
        try {
            const { error: saveError } = await supabase
                .from('global_settings')
                .update({
                    cost_settings: costSettings,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', 'current');

            if (saveError) throw saveError;

            setDirty(false);
            setSaved(true);
            showToast('Cost settings saved');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Save failed';
            console.error('Error saving cost settings:', err);
            showToast(msg);
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestAccount = async (
        key: string,
        payload: { accountId?: string; cloudName?: string; apiKey?: string; apiSecret?: string }
    ) => {
        setTestStates(prev => ({ ...prev, [key]: { status: 'testing' } }));
        try {
            const res = await fetch('/api/cloudinary/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) {
                setTestStates(prev => ({ ...prev, [key]: { status: 'ok' } }));
            } else {
                setTestStates(prev => ({
                    ...prev,
                    [key]: { status: 'fail', message: data.error || 'Connection failed' },
                }));
            }
        } catch {
            setTestStates(prev => ({
                ...prev,
                [key]: { status: 'fail', message: 'Connection failed' },
            }));
        }
        setTimeout(() => {
            setTestStates(prev => ({ ...prev, [key]: { status: 'idle' } }));
        }, 3500);
    };

    const handleSetDefaultAccount = async (acc: CloudinaryAccount) => {
        try {
            const { error: rpcErr } = await supabase.rpc('set_default_cloudinary_account', {
                target_id: acc.id,
            });

            if (rpcErr) {
                // Fallback two-step update if RPC isn't loaded yet
                await supabase
                    .from('cloudinary_accounts')
                    .update({ is_default: false, updated_at: new Date().toISOString() })
                    .eq('is_default', true);
                const { error: setErr } = await supabase
                    .from('cloudinary_accounts')
                    .update({ is_default: true, updated_at: new Date().toISOString() })
                    .eq('id', acc.id);
                if (setErr) throw setErr;
            }

            await fetchSettings();
            showToast(`"${acc.label}" is now the default Cloudinary account`);
        } catch (err: any) {
            console.error('Failed to set default account:', err);
            showToast(err?.message || 'Failed to update default account');
        }
    };

    const handleCreateAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        const label = newAccountForm.label.trim();
        const cloudName = newAccountForm.cloudName.trim();
        const apiKey = newAccountForm.apiKey.trim();
        const apiSecret = newAccountForm.apiSecret.trim();

        if (!label || !cloudName || !apiKey || !apiSecret) {
            showToast('Please fill in label, cloud name, API key, and API secret');
            return;
        }

        const shouldBeDefault = accounts.length === 0 || newAccountForm.isDefault;
        setIsSavingAccount(true);

        try {
            if (shouldBeDefault && accounts.some(a => a.isDefault)) {
                await supabase
                    .from('cloudinary_accounts')
                    .update({ is_default: false, updated_at: new Date().toISOString() })
                    .eq('is_default', true);
            }

            const { error } = await supabase.from('cloudinary_accounts').insert([
                {
                    label,
                    cloud_name: cloudName,
                    api_key: apiKey,
                    api_secret: apiSecret,
                    is_default: shouldBeDefault,
                },
            ]);

            if (error) throw error;

            setNewAccountForm(EMPTY_ACCOUNT_FORM);
            setShowNewSecret(false);
            setIsAddingAccount(false);
            await fetchSettings();
            showToast(`Added Cloudinary account "${label}"`);
        } catch (err: any) {
            console.error('Error creating Cloudinary account:', err);
            showToast(err?.message || 'Failed to add Cloudinary account');
        } finally {
            setIsSavingAccount(false);
        }
    };

    const startEditingAccount = (acc: CloudinaryAccount) => {
        setIsAddingAccount(false);
        setEditingAccountId(acc.id);
        setShowEditSecret(false);
        setEditAccountForm({
            label: acc.label,
            cloudName: acc.cloudName,
            apiKey: acc.apiKey,
            apiSecret: acc.apiSecret,
            isDefault: acc.isDefault,
        });
    };

    const handleUpdateAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingAccountId) return;

        const label = editAccountForm.label.trim();
        const cloudName = editAccountForm.cloudName.trim();
        const apiKey = editAccountForm.apiKey.trim();
        const apiSecret = editAccountForm.apiSecret.trim();

        if (!label || !cloudName || !apiKey || !apiSecret) {
            showToast('All fields are required');
            return;
        }

        setIsSavingAccount(true);
        try {
            const { error } = await supabase
                .from('cloudinary_accounts')
                .update({
                    label,
                    cloud_name: cloudName,
                    api_key: apiKey,
                    api_secret: apiSecret,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', editingAccountId);

            if (error) throw error;

            setEditingAccountId(null);
            await fetchSettings();
            showToast(`Updated "${label}"`);
        } catch (err: any) {
            console.error('Error updating Cloudinary account:', err);
            showToast(err?.message || 'Failed to update account');
        } finally {
            setIsSavingAccount(false);
        }
    };

    const handleConfirmDeleteAccount = async () => {
        if (!deleteTargetAccount) return;
        setIsDeletingAccount(true);
        try {
            const wasDefault = deleteTargetAccount.isDefault;
            const { error } = await supabase
                .from('cloudinary_accounts')
                .delete()
                .eq('id', deleteTargetAccount.id);

            if (error) throw error;

            const remaining = accounts.filter(a => a.id !== deleteTargetAccount.id);
            if (wasDefault && remaining.length > 0) {
                await handleSetDefaultAccount(remaining[0]);
            } else {
                await fetchSettings();
            }

            showToast(`Deleted "${deleteTargetAccount.label}"`);
            setDeleteTargetAccount(null);
        } catch (err: any) {
            console.error('Error deleting Cloudinary account:', err);
            showToast(
                err?.code === '23503'
                    ? 'Cannot delete: projects are still linked to this account'
                    : err?.message || 'Failed to delete account'
            );
        } finally {
            setIsDeletingAccount(false);
        }
    };

    if (!user || user.role !== UserRole.ADMIN) return null;

    const getLinkedProjectsCount = (acc: CloudinaryAccount) => {
        const direct = usageByAccount[acc.id] || 0;
        return acc.isDefault ? direct + unassignedProjectsCount : direct;
    };

    const renderTestLabel = (key: string) => {
        const st = testStates[key]?.status || 'idle';
        if (st === 'testing') return 'Testing…';
        if (st === 'ok') return 'Connected ✓';
        if (st === 'fail') return 'Failed';
        return 'Test connection';
    };

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
                    onClick={handleSaveCostSettings}
                >
                    {isSaving ? 'Saving…' : saved && !dirty ? 'Saved' : 'Save cost changes'}
                </button>
            </header>

            {isLoading ? (
                <div
                    className="card emerge"
                    style={{ padding: 48, textAlign: 'center', color: '#5C5C66' }}
                >
                    Loading settings…
                </div>
            ) : (
                <>
                    {/* 1. Image storage (Cloudinary Accounts) */}
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
                                    Cloudinary accounts
                                </h2>
                                <div
                                    style={{
                                        fontSize: 14,
                                        color: '#5C5C66',
                                        lineHeight: 1.5,
                                        maxWidth: 580,
                                    }}
                                >
                                    Manage one or more Cloudinary accounts. New projects use the{' '}
                                    <b style={{ color: '#050507' }}>Default</b> account
                                    automatically, or can choose any account below.
                                </div>
                            </div>

                            {!migrationMissing && !isAddingAccount && (
                                <button
                                    type="button"
                                    className="btn btn-pink"
                                    onClick={() => {
                                        setEditingAccountId(null);
                                        setNewAccountForm({
                                            ...EMPTY_ACCOUNT_FORM,
                                            isDefault: accounts.length === 0,
                                        });
                                        setIsAddingAccount(true);
                                    }}
                                >
                                    <Plus size={16} />
                                    Add account
                                </button>
                            )}
                        </div>

                        {migrationMissing && (
                            <div
                                style={{
                                    padding: '16px 20px',
                                    borderRadius: 4,
                                    border: '1px solid #E8C4C9',
                                    background: '#FBE6E9',
                                    color: '#8E1B2B',
                                    fontSize: 13,
                                    lineHeight: 1.55,
                                }}
                            >
                                <b>Database migration pending:</b> Run{' '}
                                <code>
                                    supabase/migrations/20261111153000_create_cloudinary_accounts.sql
                                </code>{' '}
                                in your Supabase SQL Editor to create the{' '}
                                <code>cloudinary_accounts</code> table and automatically import your
                                existing credentials.
                            </div>
                        )}

                        {/* Add New Account Form */}
                        {isAddingAccount && (
                            <form
                                onSubmit={handleCreateAccount}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 16,
                                    padding: 20,
                                    borderRadius: 4,
                                    background: '#EEEBE5',
                                    border: '1px solid #CFCAC1',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                    }}
                                >
                                    <span className="lbl" style={{ color: '#FF0066' }}>
                                        New Cloudinary account
                                    </span>
                                </div>

                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                                        gap: 14,
                                    }}
                                >
                                    <label
                                        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                                    >
                                        <span className="lbl" style={{ fontSize: 10 }}>
                                            Account label
                                        </span>
                                        <input
                                            className="field"
                                            type="text"
                                            placeholder="e.g. 5dVR Primary"
                                            value={newAccountForm.label}
                                            onChange={e =>
                                                setNewAccountForm(prev => ({
                                                    ...prev,
                                                    label: e.target.value,
                                                }))
                                            }
                                            required
                                        />
                                    </label>

                                    <label
                                        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                                    >
                                        <span className="lbl" style={{ fontSize: 10 }}>
                                            Cloud name
                                        </span>
                                        <input
                                            className="field"
                                            type="text"
                                            placeholder="e.g. dniredeim"
                                            value={newAccountForm.cloudName}
                                            onChange={e =>
                                                setNewAccountForm(prev => ({
                                                    ...prev,
                                                    cloudName: e.target.value,
                                                }))
                                            }
                                            required
                                        />
                                    </label>

                                    <label
                                        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                                    >
                                        <span className="lbl" style={{ fontSize: 10 }}>
                                            API key
                                        </span>
                                        <input
                                            className="field"
                                            type="text"
                                            placeholder="123456789012345"
                                            value={newAccountForm.apiKey}
                                            onChange={e =>
                                                setNewAccountForm(prev => ({
                                                    ...prev,
                                                    apiKey: e.target.value,
                                                }))
                                            }
                                            required
                                        />
                                    </label>

                                    <label
                                        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                                    >
                                        <span className="lbl" style={{ fontSize: 10 }}>
                                            API secret
                                        </span>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                className="field"
                                                type={showNewSecret ? 'text' : 'password'}
                                                placeholder="••••••••••••••••"
                                                value={newAccountForm.apiSecret}
                                                onChange={e =>
                                                    setNewAccountForm(prev => ({
                                                        ...prev,
                                                        apiSecret: e.target.value,
                                                    }))
                                                }
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowNewSecret(s => !s)}
                                                style={{
                                                    position: 'absolute',
                                                    right: 10,
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    background: 'none',
                                                    border: 0,
                                                    cursor: 'pointer',
                                                    color: '#5C5C66',
                                                }}
                                            >
                                                {showNewSecret ? (
                                                    <EyeOff size={15} />
                                                ) : (
                                                    <Eye size={15} />
                                                )}
                                            </button>
                                        </div>
                                    </label>
                                </div>

                                <div
                                    style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 12,
                                    }}
                                >
                                    <label
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            fontSize: 13,
                                            cursor: accounts.length === 0 ? 'default' : 'pointer',
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={
                                                accounts.length === 0 || newAccountForm.isDefault
                                            }
                                            disabled={accounts.length === 0}
                                            onChange={e =>
                                                setNewAccountForm(prev => ({
                                                    ...prev,
                                                    isDefault: e.target.checked,
                                                }))
                                            }
                                            style={{
                                                width: 16,
                                                height: 16,
                                                accentColor: '#FF0066',
                                            }}
                                        />
                                        Set as default account for new projects
                                    </label>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={() =>
                                                handleTestAccount('new', {
                                                    cloudName: newAccountForm.cloudName,
                                                    apiKey: newAccountForm.apiKey,
                                                    apiSecret: newAccountForm.apiSecret,
                                                })
                                            }
                                        >
                                            {renderTestLabel('new')}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={() => setIsAddingAccount(false)}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="btn btn-pink"
                                            disabled={isSavingAccount}
                                        >
                                            {isSavingAccount ? 'Saving…' : 'Save account'}
                                        </button>
                                    </div>
                                </div>

                                {testStates['new']?.status === 'fail' &&
                                    testStates['new']?.message && (
                                        <div style={{ fontSize: 12, color: '#C6283D' }}>
                                            {testStates['new'].message}
                                        </div>
                                    )}
                            </form>
                        )}

                        {/* Existing Accounts List */}
                        {!migrationMissing && accounts.length === 0 && !isAddingAccount ? (
                            <div
                                style={{
                                    padding: 28,
                                    borderRadius: 4,
                                    background: '#EEEBE5',
                                    textAlign: 'center',
                                    color: '#5C5C66',
                                    fontSize: 14,
                                }}
                            >
                                No Cloudinary accounts added yet. Click <b>Add account</b> above to
                                connect your first storage account.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {accounts.map(acc => {
                                    const linkedCount = getLinkedProjectsCount(acc);
                                    const isEditing = editingAccountId === acc.id;
                                    const maskedKey =
                                        acc.apiKey.length > 4
                                            ? `••••${acc.apiKey.slice(-4)}`
                                            : '••••';

                                    if (isEditing) {
                                        return (
                                            <form
                                                key={acc.id}
                                                onSubmit={handleUpdateAccount}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: 16,
                                                    padding: 20,
                                                    borderRadius: 4,
                                                    background: '#EEEBE5',
                                                    border: '1px solid #CFCAC1',
                                                }}
                                            >
                                                <span
                                                    className="lbl"
                                                    style={{ color: '#FF0066' }}
                                                >
                                                    Editing · {acc.label}
                                                </span>

                                                <div
                                                    style={{
                                                        display: 'grid',
                                                        gridTemplateColumns:
                                                            'repeat(auto-fit, minmax(210px, 1fr))',
                                                        gap: 14,
                                                    }}
                                                >
                                                    <label
                                                        style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: 6,
                                                        }}
                                                    >
                                                        <span
                                                            className="lbl"
                                                            style={{ fontSize: 10 }}
                                                        >
                                                            Account label
                                                        </span>
                                                        <input
                                                            className="field"
                                                            type="text"
                                                            value={editAccountForm.label}
                                                            onChange={e =>
                                                                setEditAccountForm(prev => ({
                                                                    ...prev,
                                                                    label: e.target.value,
                                                                }))
                                                            }
                                                            required
                                                        />
                                                    </label>

                                                    <label
                                                        style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: 6,
                                                        }}
                                                    >
                                                        <span
                                                            className="lbl"
                                                            style={{ fontSize: 10 }}
                                                        >
                                                            Cloud name
                                                        </span>
                                                        <input
                                                            className="field"
                                                            type="text"
                                                            value={editAccountForm.cloudName}
                                                            onChange={e =>
                                                                setEditAccountForm(prev => ({
                                                                    ...prev,
                                                                    cloudName: e.target.value,
                                                                }))
                                                            }
                                                            required
                                                        />
                                                    </label>

                                                    <label
                                                        style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: 6,
                                                        }}
                                                    >
                                                        <span
                                                            className="lbl"
                                                            style={{ fontSize: 10 }}
                                                        >
                                                            API key
                                                        </span>
                                                        <input
                                                            className="field"
                                                            type="text"
                                                            value={editAccountForm.apiKey}
                                                            onChange={e =>
                                                                setEditAccountForm(prev => ({
                                                                    ...prev,
                                                                    apiKey: e.target.value,
                                                                }))
                                                            }
                                                            required
                                                        />
                                                    </label>

                                                    <label
                                                        style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: 6,
                                                        }}
                                                    >
                                                        <span
                                                            className="lbl"
                                                            style={{ fontSize: 10 }}
                                                        >
                                                            API secret
                                                        </span>
                                                        <div style={{ position: 'relative' }}>
                                                            <input
                                                                className="field"
                                                                type={
                                                                    showEditSecret
                                                                        ? 'text'
                                                                        : 'password'
                                                                }
                                                                value={editAccountForm.apiSecret}
                                                                onChange={e =>
                                                                    setEditAccountForm(prev => ({
                                                                        ...prev,
                                                                        apiSecret: e.target.value,
                                                                    }))
                                                                }
                                                                required
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setShowEditSecret(s => !s)
                                                                }
                                                                style={{
                                                                    position: 'absolute',
                                                                    right: 10,
                                                                    top: '50%',
                                                                    transform: 'translateY(-50%)',
                                                                    background: 'none',
                                                                    border: 0,
                                                                    cursor: 'pointer',
                                                                    color: '#5C5C66',
                                                                }}
                                                            >
                                                                {showEditSecret ? (
                                                                    <EyeOff size={15} />
                                                                ) : (
                                                                    <Eye size={15} />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </label>
                                                </div>

                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        flexWrap: 'wrap',
                                                        gap: 12,
                                                    }}
                                                >
                                                    <span
                                                        style={{ fontSize: 12, color: '#5C5C66' }}
                                                    >
                                                        Changes apply immediately to all{' '}
                                                        <b>{linkedCount}</b> linked project
                                                        {linkedCount === 1 ? '' : 's'}.
                                                    </span>

                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            flexWrap: 'wrap',
                                                            gap: 8,
                                                        }}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="btn"
                                                            onClick={() =>
                                                                handleTestAccount(`edit-${acc.id}`, {
                                                                    cloudName:
                                                                        editAccountForm.cloudName,
                                                                    apiKey: editAccountForm.apiKey,
                                                                    apiSecret:
                                                                        editAccountForm.apiSecret,
                                                                })
                                                            }
                                                        >
                                                            {renderTestLabel(`edit-${acc.id}`)}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn"
                                                            onClick={() =>
                                                                setEditingAccountId(null)
                                                            }
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="submit"
                                                            className="btn btn-pink"
                                                            disabled={isSavingAccount}
                                                        >
                                                            {isSavingAccount
                                                                ? 'Saving…'
                                                                : 'Save changes'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {testStates[`edit-${acc.id}`]?.status === 'fail' &&
                                                    testStates[`edit-${acc.id}`]?.message && (
                                                        <div
                                                            style={{
                                                                fontSize: 12,
                                                                color: '#C6283D',
                                                            }}
                                                        >
                                                            {testStates[`edit-${acc.id}`].message}
                                                        </div>
                                                    )}
                                            </form>
                                        );
                                    }

                                    return (
                                        <div
                                            key={acc.id}
                                            style={{
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 16,
                                                padding: '16px 20px',
                                                borderRadius: 4,
                                                background: '#EEEBE5',
                                                border: acc.isDefault
                                                    ? '1px solid #FF0066'
                                                    : '1px solid #E3DFD8',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: 6,
                                                    minWidth: 220,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 10,
                                                        flexWrap: 'wrap',
                                                    }}
                                                >
                                                    <span
                                                        style={{ fontWeight: 700, fontSize: 15 }}
                                                    >
                                                        {acc.label}
                                                    </span>
                                                    {acc.isDefault && (
                                                        <span
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: 5,
                                                                padding: '2px 10px',
                                                                borderRadius: 999,
                                                                background: '#FFE8F1',
                                                                color: '#FF0066',
                                                                fontSize: 11,
                                                                fontWeight: 700,
                                                                letterSpacing: '.04em',
                                                                textTransform: 'uppercase',
                                                            }}
                                                        >
                                                            <Check size={12} /> Default
                                                        </span>
                                                    )}
                                                </div>

                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 10,
                                                        flexWrap: 'wrap',
                                                        fontSize: 13,
                                                        color: '#5C5C66',
                                                    }}
                                                >
                                                    <span>
                                                        Cloud:{' '}
                                                        <code
                                                            className="mono"
                                                            style={{
                                                                color: '#050507',
                                                                fontWeight: 600,
                                                            }}
                                                        >
                                                            {acc.cloudName}
                                                        </code>
                                                    </span>
                                                    <span>·</span>
                                                    <span>Key {maskedKey}</span>
                                                    <span>·</span>
                                                    <span>
                                                        <b style={{ color: '#050507' }}>
                                                            {linkedCount}
                                                        </b>{' '}
                                                        project{linkedCount === 1 ? '' : 's'}
                                                    </span>
                                                </div>

                                                {testStates[acc.id]?.status === 'fail' &&
                                                    testStates[acc.id]?.message && (
                                                        <div
                                                            style={{
                                                                fontSize: 12,
                                                                color: '#C6283D',
                                                            }}
                                                        >
                                                            {testStates[acc.id].message}
                                                        </div>
                                                    )}
                                            </div>

                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    flexWrap: 'wrap',
                                                    gap: 8,
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    className="btn"
                                                    onClick={() =>
                                                        handleTestAccount(acc.id, {
                                                            accountId: acc.id,
                                                        })
                                                    }
                                                >
                                                    {renderTestLabel(acc.id)}
                                                </button>

                                                {!acc.isDefault && (
                                                    <button
                                                        type="button"
                                                        className="btn"
                                                        onClick={() =>
                                                            handleSetDefaultAccount(acc)
                                                        }
                                                    >
                                                        Set default
                                                    </button>
                                                )}

                                                <button
                                                    type="button"
                                                    className="btn"
                                                    onClick={() => startEditingAccount(acc)}
                                                >
                                                    Edit
                                                </button>

                                                <button
                                                    type="button"
                                                    className="icon-btn danger"
                                                    disabled={linkedCount > 0}
                                                    title={
                                                        linkedCount > 0
                                                            ? `Used by ${linkedCount} project(s) — reassign them first before deleting`
                                                            : 'Delete Cloudinary account'
                                                    }
                                                    aria-label={`Delete ${acc.label}`}
                                                    onClick={() => setDeleteTargetAccount(acc)}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    {/* 2. Cost settings */}
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
                                    Price per portrait for each AI model, in US dollars. Each project
                                    picks a model and number of references, and its cost is worked out
                                    from here.
                                </div>
                            </div>

                            <button type="button" className="btn" onClick={handleAddModel}>
                                <Plus size={16} />
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
                                        />
                                    </tr>
                                </thead>
                                <tbody className="stagger">
                                    {costSettings.map((m, idx) => (
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
                                                        <path d="M6 6l12 12M18 6L6 18" />
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ fontSize: 13, color: '#5C5C66' }}>
                            Changing a price affects cost reports for all projects using that model,
                            from now on.
                        </div>
                    </section>

                    <div style={{ fontSize: 13, color: '#5C5C66' }}>
                        Portrait limit, AI model, references, and assigned Cloudinary account can
                        be chosen per project on each project&apos;s page.
                    </div>
                </>
            )}

            {/* Delete Cloudinary Account Confirmation Dialog */}
            {deleteTargetAccount && (
                <div
                    className="fadein"
                    onClick={() => !isDeletingAccount && setDeleteTargetAccount(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(5,5,7,.45)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 24,
                        zIndex: 20,
                    }}
                >
                    <div
                        className="emerge"
                        role="dialog"
                        aria-modal="true"
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: '100%',
                            maxWidth: 440,
                            background: '#F7F5F2',
                            borderRadius: 4,
                            padding: 28,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 14,
                        }}
                    >
                        <span className="lbl" style={{ color: '#C6283D' }}>
                            Remove Cloudinary account
                        </span>
                        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                            Delete &ldquo;{deleteTargetAccount.label}&rdquo;?
                        </h2>
                        <div style={{ fontSize: 14, color: '#5C5C66', lineHeight: 1.5 }}>
                            This removes the saved credentials for{' '}
                            <code className="mono">{deleteTargetAccount.cloudName}</code> from the
                            dashboard. Images inside Cloudinary itself are not touched.
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                gap: 10,
                                justifyContent: 'flex-end',
                                marginTop: 6,
                            }}
                        >
                            <button
                                type="button"
                                className="btn"
                                disabled={isDeletingAccount}
                                onClick={() => setDeleteTargetAccount(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                disabled={isDeletingAccount}
                                onClick={handleConfirmDeleteAccount}
                            >
                                {isDeletingAccount ? 'Deleting…' : 'Delete account'}
                            </button>
                        </div>
                    </div>
                </div>
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
                        zIndex: 20,
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
                            Remove model {costSettings[removeModelIdx]?.modelName || removeModelIdx + 1}?
                        </h2>
                        <div style={{ fontSize: 14, color: '#5C5C66', lineHeight: 1.5 }}>
                            Projects using this model will need a new one before their next portrait.
                            Past cost reports keep the old prices.
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
                        zIndex: 30,
                    }}
                >
                    {toast}
                </div>
            )}
        </div>
    );
}
