'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Plus, Trash2, Check } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import {
    UserRole,
    CloudinaryAccount,
    AiModel,
    AiProvider,
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

interface ModelFormState {
    name: string;
    provider: AiProvider;
    cost1Ref: string;
    cost2Refs: string;
    cost3PlusRefs: string;
    isDefault: boolean;
}

const EMPTY_MODEL_FORM: ModelFormState = {
    name: '',
    provider: 'openai',
    cost1Ref: '0.06',
    cost2Refs: '0.08',
    cost3PlusRefs: '0.10',
    isDefault: false,
};

export default function SettingsPage() {
    const { user, isAuthenticated } = useAuth();
    const router = useRouter();

    const [projectsCount, setProjectsCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // Cloudinary Accounts state
    const [accounts, setAccounts] = useState<CloudinaryAccount[]>([]);
    const [usageByAccount, setUsageByAccount] = useState<Record<string, number>>({});
    const [unassignedAccountsCount, setUnassignedAccountsCount] = useState(0);
    const [cloudinaryMigrationMissing, setCloudinaryMigrationMissing] = useState(false);

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

    // AI Models state
    const [models, setModels] = useState<AiModel[]>([]);
    const [usageByModel, setUsageByModel] = useState<Record<string, number>>({});
    const [unassignedModelsCount, setUnassignedModelsCount] = useState(0);
    const [modelsMigrationMissing, setModelsMigrationMissing] = useState(false);

    const [isAddingModel, setIsAddingModel] = useState(false);
    const [newModelForm, setNewModelForm] = useState<ModelFormState>(EMPTY_MODEL_FORM);
    const [isSavingModel, setIsSavingModel] = useState(false);

    const [editingModelId, setEditingModelId] = useState<string | null>(null);
    const [editModelForm, setEditModelForm] = useState<ModelFormState>(EMPTY_MODEL_FORM);

    const [deleteTargetModel, setDeleteTargetModel] = useState<AiModel | null>(null);
    const [isDeletingModel, setIsDeletingModel] = useState(false);

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
            const [projRes, accRes, modRes] = await Promise.all([
                supabase.from('projects').select('*'),
                supabase
                    .from('cloudinary_accounts')
                    .select('*')
                    .order('is_default', { ascending: false })
                    .order('created_at', { ascending: true }),
                supabase
                    .from('ai_models')
                    .select('*')
                    .order('is_default', { ascending: false })
                    .order('created_at', { ascending: true }),
            ]);

            const projectRows = projRes.data || [];
            setProjectsCount(projectRows.length);

            const accMap: Record<string, number> = {};
            let unassignedAcc = 0;
            const modMap: Record<string, number> = {};
            let unassignedMod = 0;

            for (const p of projectRows) {
                if (p.cloudinary_account_id) {
                    accMap[p.cloudinary_account_id] =
                        (accMap[p.cloudinary_account_id] || 0) + 1;
                } else {
                    unassignedAcc++;
                }

                if (p.ai_model_id) {
                    modMap[p.ai_model_id] = (modMap[p.ai_model_id] || 0) + 1;
                } else {
                    unassignedMod++;
                }
            }

            setUsageByAccount(accMap);
            setUnassignedAccountsCount(unassignedAcc);
            setUsageByModel(modMap);
            setUnassignedModelsCount(unassignedMod);

            // Cloudinary accounts
            if (
                accRes.error &&
                (accRes.error.code === '42P01' ||
                    accRes.error.code === 'PGRST205' ||
                    accRes.error.message?.includes('cloudinary_accounts'))
            ) {
                setCloudinaryMigrationMissing(true);
                setAccounts([]);
            } else if (accRes.error) {
                throw accRes.error;
            } else {
                setCloudinaryMigrationMissing(false);
                setAccounts(
                    (accRes.data || []).map(a => ({
                        id: a.id,
                        label: a.label,
                        cloudName: a.cloud_name,
                        apiKey: a.api_key,
                        apiSecret: a.api_secret,
                        isDefault: Boolean(a.is_default),
                        createdAt: a.created_at,
                        updatedAt: a.updated_at,
                    }))
                );
            }

            // AI models
            if (
                modRes.error &&
                (modRes.error.code === '42P01' ||
                    modRes.error.code === 'PGRST205' ||
                    modRes.error.message?.includes('ai_models'))
            ) {
                setModelsMigrationMissing(true);
                setModels([]);
            } else if (modRes.error) {
                throw modRes.error;
            } else {
                setModelsMigrationMissing(false);
                setModels(
                    (modRes.data || []).map(m => ({
                        id: m.id,
                        name: m.name,
                        provider: m.provider === 'gemini' ? 'gemini' : 'openai',
                        cost1Ref: Number(m.cost_1_ref) || 0,
                        cost2Refs: Number(m.cost_2_refs) || 0,
                        cost3PlusRefs: Number(m.cost_3_plus_refs) || 0,
                        isDefault: Boolean(m.is_default),
                        createdAt: m.created_at,
                        updatedAt: m.updated_at,
                    }))
                );
            }
        } catch (err) {
            console.error('Error fetching global settings:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // ======================== CLOUDINARY ACCOUNTS HANDLERS ========================
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

    // ======================== AI MODELS HANDLERS ========================
    const handleSetDefaultModel = async (m: AiModel) => {
        try {
            const { error: rpcErr } = await supabase.rpc('set_default_ai_model', {
                target_id: m.id,
            });

            if (rpcErr) {
                await supabase
                    .from('ai_models')
                    .update({ is_default: false, updated_at: new Date().toISOString() })
                    .eq('is_default', true);
                const { error: setErr } = await supabase
                    .from('ai_models')
                    .update({ is_default: true, updated_at: new Date().toISOString() })
                    .eq('id', m.id);
                if (setErr) throw setErr;
            }

            await fetchSettings();
            showToast(`"${m.name}" is now the default AI model`);
        } catch (err: any) {
            console.error('Failed to set default model:', err);
            showToast(err?.message || 'Failed to update default model');
        }
    };

    const handleCreateModel = async (e: React.FormEvent) => {
        e.preventDefault();
        const name = newModelForm.name.trim();
        if (!name) {
            showToast('Model name is required');
            return;
        }

        const c1 = Math.max(0, parseFloat(newModelForm.cost1Ref) || 0);
        const c2 = Math.max(0, parseFloat(newModelForm.cost2Refs) || 0);
        const c3 = Math.max(0, parseFloat(newModelForm.cost3PlusRefs) || 0);
        const shouldBeDefault = models.length === 0 || newModelForm.isDefault;

        setIsSavingModel(true);
        try {
            if (shouldBeDefault && models.some(m => m.isDefault)) {
                await supabase
                    .from('ai_models')
                    .update({ is_default: false, updated_at: new Date().toISOString() })
                    .eq('is_default', true);
            }

            const { error } = await supabase.from('ai_models').insert([
                {
                    name,
                    provider: newModelForm.provider,
                    cost_1_ref: c1,
                    cost_2_refs: c2,
                    cost_3_plus_refs: c3,
                    is_default: shouldBeDefault,
                },
            ]);

            if (error) throw error;

            setNewModelForm(EMPTY_MODEL_FORM);
            setIsAddingModel(false);
            await fetchSettings();
            showToast(`Added model "${name}"`);
        } catch (err: any) {
            console.error('Error adding AI model:', err);
            showToast(
                err?.code === '23505'
                    ? `A model named "${name}" already exists`
                    : err?.message || 'Failed to add model'
            );
        } finally {
            setIsSavingModel(false);
        }
    };

    const startEditingModel = (m: AiModel) => {
        setIsAddingModel(false);
        setEditingModelId(m.id);
        setEditModelForm({
            name: m.name,
            provider: m.provider,
            cost1Ref: String(m.cost1Ref),
            cost2Refs: String(m.cost2Refs),
            cost3PlusRefs: String(m.cost3PlusRefs),
            isDefault: m.isDefault,
        });
    };

    const handleUpdateModel = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingModelId) return;

        const name = editModelForm.name.trim();
        if (!name) {
            showToast('Model name is required');
            return;
        }

        const c1 = Math.max(0, parseFloat(editModelForm.cost1Ref) || 0);
        const c2 = Math.max(0, parseFloat(editModelForm.cost2Refs) || 0);
        const c3 = Math.max(0, parseFloat(editModelForm.cost3PlusRefs) || 0);

        setIsSavingModel(true);
        try {
            const { error } = await supabase
                .from('ai_models')
                .update({
                    name,
                    provider: editModelForm.provider,
                    cost_1_ref: c1,
                    cost_2_refs: c2,
                    cost_3_plus_refs: c3,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', editingModelId);

            if (error) throw error;

            setEditingModelId(null);
            await fetchSettings();
            showToast(`Updated "${name}"`);
        } catch (err: any) {
            console.error('Error updating AI model:', err);
            showToast(
                err?.code === '23505'
                    ? `A model named "${name}" already exists`
                    : err?.message || 'Failed to update model'
            );
        } finally {
            setIsSavingModel(false);
        }
    };

    const handleConfirmDeleteModel = async () => {
        if (!deleteTargetModel) return;
        setIsDeletingModel(true);
        try {
            const wasDefault = deleteTargetModel.isDefault;
            const { error } = await supabase
                .from('ai_models')
                .delete()
                .eq('id', deleteTargetModel.id);

            if (error) throw error;

            const remaining = models.filter(m => m.id !== deleteTargetModel.id);
            if (wasDefault && remaining.length > 0) {
                await handleSetDefaultModel(remaining[0]);
            } else {
                await fetchSettings();
            }

            showToast(`Deleted model "${deleteTargetModel.name}"`);
            setDeleteTargetModel(null);
        } catch (err: any) {
            console.error('Error deleting AI model:', err);
            showToast(
                err?.code === '23503'
                    ? 'Cannot delete: projects are still using this model'
                    : err?.message || 'Failed to delete model'
            );
        } finally {
            setIsDeletingModel(false);
        }
    };

    if (!user || user.role !== UserRole.ADMIN) return null;

    const getLinkedAccountProjectsCount = (acc: CloudinaryAccount) => {
        const direct = usageByAccount[acc.id] || 0;
        return acc.isDefault ? direct + unassignedAccountsCount : direct;
    };

    const getLinkedModelProjectsCount = (m: AiModel) => {
        const direct = usageByModel[m.id] || 0;
        return m.isDefault ? direct + unassignedModelsCount : direct;
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
                        Shared catalog across all {projectsCount} project
                        {projectsCount === 1 ? '' : 's'}
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
                    {/* ======================== 1. CLOUDINARY ACCOUNTS ======================== */}
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

                            {!cloudinaryMigrationMissing && !isAddingAccount && (
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

                        {cloudinaryMigrationMissing && (
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
                                in your Supabase SQL Editor.
                            </div>
                        )}

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
                                <span className="lbl" style={{ color: '#FF0066' }}>
                                    New Cloudinary account
                                </span>

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

                        {!cloudinaryMigrationMissing && accounts.length === 0 && !isAddingAccount ? (
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
                                    const linkedCount = getLinkedAccountProjectsCount(acc);
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

                    {/* ======================== 2. IMAGE MODELS CATALOG & PRICING ======================== */}
                    <section className="card emerge" aria-labelledby="mod-h">
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
                                <h2 id="mod-h" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                                    Image models &amp; pricing
                                </h2>
                                <div
                                    style={{
                                        fontSize: 14,
                                        color: '#5C5C66',
                                        lineHeight: 1.5,
                                        maxWidth: 620,
                                    }}
                                >
                                    Catalog of AI image models and per-portrait USD prices (
                                    <b style={{ color: '#050507' }}>1 ref</b>,{' '}
                                    <b style={{ color: '#050507' }}>2 refs</b>,{' '}
                                    <b style={{ color: '#050507' }}>2+ refs</b>). Each project
                                    selects a model here and configures its own API key.
                                </div>
                            </div>

                            {!modelsMigrationMissing && !isAddingModel && (
                                <button
                                    type="button"
                                    className="btn btn-pink"
                                    onClick={() => {
                                        setEditingModelId(null);
                                        setNewModelForm({
                                            ...EMPTY_MODEL_FORM,
                                            isDefault: models.length === 0,
                                        });
                                        setIsAddingModel(true);
                                    }}
                                >
                                    <Plus size={16} />
                                    Add model
                                </button>
                            )}
                        </div>

                        {modelsMigrationMissing && (
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
                                    supabase/migrations/20261111163500_create_ai_models.sql
                                </code>{' '}
                                in your Supabase SQL Editor to create the <code>ai_models</code>{' '}
                                table and automatically import your existing models and project
                                assignments.
                            </div>
                        )}

                        {/* Add Model Form */}
                        {isAddingModel && (
                            <form
                                onSubmit={handleCreateModel}
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
                                <span className="lbl" style={{ color: '#FF0066' }}>
                                    New AI image model
                                </span>

                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns:
                                            'repeat(auto-fit, minmax(160px, 1fr))',
                                        gap: 14,
                                    }}
                                >
                                    <label
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 6,
                                            gridColumn: 'span 2',
                                        }}
                                    >
                                        <span className="lbl" style={{ fontSize: 10 }}>
                                            Model ID / name
                                        </span>
                                        <input
                                            className="field"
                                            type="text"
                                            placeholder="e.g. gpt-image-2.6-flare"
                                            value={newModelForm.name}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setNewModelForm(prev => ({
                                                    ...prev,
                                                    name: val,
                                                    provider: val
                                                        .toLowerCase()
                                                        .includes('gemini')
                                                        ? 'gemini'
                                                        : prev.provider,
                                                }));
                                            }}
                                            required
                                        />
                                    </label>

                                    <label
                                        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                                    >
                                        <span className="lbl" style={{ fontSize: 10 }}>
                                            Provider
                                        </span>
                                        <select
                                            className="field"
                                            value={newModelForm.provider}
                                            onChange={e =>
                                                setNewModelForm(prev => ({
                                                    ...prev,
                                                    provider: e.target.value as AiProvider,
                                                }))
                                            }
                                        >
                                            <option value="openai">OpenAI</option>
                                            <option value="gemini">Google Gemini</option>
                                        </select>
                                    </label>

                                    <label
                                        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                                    >
                                        <span className="lbl" style={{ fontSize: 10 }}>
                                            1 reference ($)
                                        </span>
                                        <input
                                            className="field"
                                            type="number"
                                            step="0.001"
                                            min="0"
                                            value={newModelForm.cost1Ref}
                                            onChange={e =>
                                                setNewModelForm(prev => ({
                                                    ...prev,
                                                    cost1Ref: e.target.value,
                                                }))
                                            }
                                            required
                                        />
                                    </label>

                                    <label
                                        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                                    >
                                        <span className="lbl" style={{ fontSize: 10 }}>
                                            2 references ($)
                                        </span>
                                        <input
                                            className="field"
                                            type="number"
                                            step="0.001"
                                            min="0"
                                            value={newModelForm.cost2Refs}
                                            onChange={e =>
                                                setNewModelForm(prev => ({
                                                    ...prev,
                                                    cost2Refs: e.target.value,
                                                }))
                                            }
                                            required
                                        />
                                    </label>

                                    <label
                                        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                                    >
                                        <span className="lbl" style={{ fontSize: 10 }}>
                                            2+ references ($)
                                        </span>
                                        <input
                                            className="field"
                                            type="number"
                                            step="0.001"
                                            min="0"
                                            value={newModelForm.cost3PlusRefs}
                                            onChange={e =>
                                                setNewModelForm(prev => ({
                                                    ...prev,
                                                    cost3PlusRefs: e.target.value,
                                                }))
                                            }
                                            required
                                        />
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
                                            cursor: models.length === 0 ? 'default' : 'pointer',
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={models.length === 0 || newModelForm.isDefault}
                                            disabled={models.length === 0}
                                            onChange={e =>
                                                setNewModelForm(prev => ({
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
                                        Set as default model for new projects
                                    </label>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={() => setIsAddingModel(false)}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="btn btn-pink"
                                            disabled={isSavingModel}
                                        >
                                            {isSavingModel ? 'Saving…' : 'Save model'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        )}

                        {!modelsMigrationMissing && models.length === 0 && !isAddingModel ? (
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
                                No AI models configured yet. Click <b>Add model</b> above to add
                                your first model.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {models.map(m => {
                                    const linkedCount = getLinkedModelProjectsCount(m);
                                    const isEditing = editingModelId === m.id;

                                    if (isEditing) {
                                        return (
                                            <form
                                                key={m.id}
                                                onSubmit={handleUpdateModel}
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
                                                    Editing · {m.name}
                                                </span>

                                                <div
                                                    style={{
                                                        display: 'grid',
                                                        gridTemplateColumns:
                                                            'repeat(auto-fit, minmax(160px, 1fr))',
                                                        gap: 14,
                                                    }}
                                                >
                                                    <label
                                                        style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: 6,
                                                            gridColumn: 'span 2',
                                                        }}
                                                    >
                                                        <span
                                                            className="lbl"
                                                            style={{ fontSize: 10 }}
                                                        >
                                                            Model ID / name
                                                        </span>
                                                        <input
                                                            className="field"
                                                            type="text"
                                                            value={editModelForm.name}
                                                            onChange={e =>
                                                                setEditModelForm(prev => ({
                                                                    ...prev,
                                                                    name: e.target.value,
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
                                                            Provider
                                                        </span>
                                                        <select
                                                            className="field"
                                                            value={editModelForm.provider}
                                                            onChange={e =>
                                                                setEditModelForm(prev => ({
                                                                    ...prev,
                                                                    provider: e.target
                                                                        .value as AiProvider,
                                                                }))
                                                            }
                                                        >
                                                            <option value="openai">OpenAI</option>
                                                            <option value="gemini">
                                                                Google Gemini
                                                            </option>
                                                        </select>
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
                                                            1 reference ($)
                                                        </span>
                                                        <input
                                                            className="field"
                                                            type="number"
                                                            step="0.001"
                                                            min="0"
                                                            value={editModelForm.cost1Ref}
                                                            onChange={e =>
                                                                setEditModelForm(prev => ({
                                                                    ...prev,
                                                                    cost1Ref: e.target.value,
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
                                                            2 references ($)
                                                        </span>
                                                        <input
                                                            className="field"
                                                            type="number"
                                                            step="0.001"
                                                            min="0"
                                                            value={editModelForm.cost2Refs}
                                                            onChange={e =>
                                                                setEditModelForm(prev => ({
                                                                    ...prev,
                                                                    cost2Refs: e.target.value,
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
                                                            2+ references ($)
                                                        </span>
                                                        <input
                                                            className="field"
                                                            type="number"
                                                            step="0.001"
                                                            min="0"
                                                            value={editModelForm.cost3PlusRefs}
                                                            onChange={e =>
                                                                setEditModelForm(prev => ({
                                                                    ...prev,
                                                                    cost3PlusRefs: e.target.value,
                                                                }))
                                                            }
                                                            required
                                                        />
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
                                                        Price updates apply across all{' '}
                                                        <b>{linkedCount}</b> project
                                                        {linkedCount === 1 ? '' : 's'} using this
                                                        model.
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
                                                            onClick={() => setEditingModelId(null)}
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="submit"
                                                            className="btn btn-pink"
                                                            disabled={isSavingModel}
                                                        >
                                                            {isSavingModel
                                                                ? 'Saving…'
                                                                : 'Save changes'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </form>
                                        );
                                    }

                                    return (
                                        <div
                                            key={m.id}
                                            style={{
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 16,
                                                padding: '16px 20px',
                                                borderRadius: 4,
                                                background: '#EEEBE5',
                                                border: m.isDefault
                                                    ? '1px solid #FF0066'
                                                    : '1px solid #E3DFD8',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: 6,
                                                    minWidth: 240,
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
                                                    <code
                                                        className="mono"
                                                        style={{
                                                            fontWeight: 700,
                                                            fontSize: 14,
                                                            color: '#050507',
                                                        }}
                                                    >
                                                        {m.name}
                                                    </code>

                                                    <span
                                                        style={{
                                                            padding: '2px 8px',
                                                            borderRadius: 999,
                                                            background:
                                                                m.provider === 'gemini'
                                                                    ? '#E8EEF5'
                                                                    : '#E6F2EC',
                                                            color:
                                                                m.provider === 'gemini'
                                                                    ? '#2A4B7C'
                                                                    : '#1F6B4A',
                                                            fontSize: 11,
                                                            fontWeight: 700,
                                                            letterSpacing: '.04em',
                                                            textTransform: 'uppercase',
                                                        }}
                                                    >
                                                        {m.provider === 'gemini'
                                                            ? 'Gemini'
                                                            : 'OpenAI'}
                                                    </span>

                                                    {m.isDefault && (
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
                                                        gap: 12,
                                                        flexWrap: 'wrap',
                                                        fontSize: 13,
                                                        color: '#5C5C66',
                                                    }}
                                                >
                                                    <span>
                                                        1 ref:{' '}
                                                        <b style={{ color: '#050507' }}>
                                                            ${m.cost1Ref.toFixed(3)}
                                                        </b>
                                                    </span>
                                                    <span>·</span>
                                                    <span>
                                                        2 refs:{' '}
                                                        <b style={{ color: '#050507' }}>
                                                            ${m.cost2Refs.toFixed(3)}
                                                        </b>
                                                    </span>
                                                    <span>·</span>
                                                    <span>
                                                        2+ refs:{' '}
                                                        <b style={{ color: '#050507' }}>
                                                            ${m.cost3PlusRefs.toFixed(3)}
                                                        </b>
                                                    </span>
                                                    <span>·</span>
                                                    <span>
                                                        <b style={{ color: '#050507' }}>
                                                            {linkedCount}
                                                        </b>{' '}
                                                        project{linkedCount === 1 ? '' : 's'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    flexWrap: 'wrap',
                                                    gap: 8,
                                                }}
                                            >
                                                {!m.isDefault && (
                                                    <button
                                                        type="button"
                                                        className="btn"
                                                        onClick={() => handleSetDefaultModel(m)}
                                                    >
                                                        Set default
                                                    </button>
                                                )}

                                                <button
                                                    type="button"
                                                    className="btn"
                                                    onClick={() => startEditingModel(m)}
                                                >
                                                    Edit
                                                </button>

                                                <button
                                                    type="button"
                                                    className="icon-btn danger"
                                                    disabled={linkedCount > 0}
                                                    title={
                                                        linkedCount > 0
                                                            ? `Used by ${linkedCount} project(s) — switch those projects to another model first`
                                                            : 'Delete model'
                                                    }
                                                    aria-label={`Delete ${m.name}`}
                                                    onClick={() => setDeleteTargetModel(m)}
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

                    <div style={{ fontSize: 13, color: '#5C5C66' }}>
                        Portrait limit, assigned AI model, API key, reference count, and Cloudinary
                        account are configured per project on each project&apos;s page.
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

            {/* Delete AI Model Confirmation Dialog */}
            {deleteTargetModel && (
                <div
                    className="fadein"
                    onClick={() => !isDeletingModel && setDeleteTargetModel(null)}
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
                            Remove AI model
                        </span>
                        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                            Delete &ldquo;{deleteTargetModel.name}&rdquo;?
                        </h2>
                        <div style={{ fontSize: 14, color: '#5C5C66', lineHeight: 1.5 }}>
                            No projects are currently linked to this model. Removing it deletes it
                            from the catalog.
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
                                disabled={isDeletingModel}
                                onClick={() => setDeleteTargetModel(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                disabled={isDeletingModel}
                                onClick={handleConfirmDeleteModel}
                            >
                                {isDeletingModel ? 'Deleting…' : 'Delete model'}
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
