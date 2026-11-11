'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    Project,
    UsageLog,
    UserRole,
    CloudinaryImage,
    CloudinaryAccount,
    AiModel,
    AiProvider,
    getAiModelPrice,
    DEFAULT_AI_MODEL_CATALOG,
    ProjectPlatformType,
} from '@/types';
import { supabase } from '@/utils/supabase';
import {
    Trash2,
    Copy,
    Check,
    Cpu,
    RefreshCw,
    Download,
    Loader2,
    Star,
    X,
    Monitor,
    Globe,
    Printer,
    Cloud,
    ShieldCheck,
    Camera,
    Sparkles,
    Upload,
    Plus,
    Eye,
    EyeOff,
    Save,
    AlertCircle,
    QrCode,
} from 'lucide-react';
import { useAuth } from '@/components/AuthContext';

type ProjectTab = 'overview' | 'gallery' | 'featured' | 'settings';
type ChartRange = 'event' | '7d' | '30d' | '90d' | 'all' | 'custom';

const AVATAR_TINTS: Array<[string, string]> = [
    ['#FFE8F0', '#FF0066'],
    ['#E8EEF5', '#2A4B7C'],
    ['#E6F2EC', '#1F6B4A'],
    ['#F3EBF6', '#6B3FA0'],
    ['#F6EFE5', '#9A5B13'],
];

function getInitials(name?: string, email?: string) {
    const src = (name || email || 'U').trim();
    const parts = src.split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return src.slice(0, 2).toUpperCase();
}

function getProjectBadgeState(p: Project): {
    label: string;
    pillClass: string;
    isLive?: boolean;
} {
    if (p.is_active === false || p.status === 'paused') {
        return { label: 'Finished', pillClass: 'p-done' };
    }
    return { label: 'In use', pillClass: 'p-use', isLive: true };
}

export default function ProjectDetailPage() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuth();

    const [project, setProject] = useState<Project | null>(null);
    const [logs, setLogs] = useState<UsageLog[]>([]);
    const [images, setImages] = useState<CloudinaryImage[]>([]);
    const [loadingImages, setLoadingImages] = useState(false);
    const [copied, setCopied] = useState(false);
    const [copiedId, setCopiedId] = useState(false);
    const [copiedSyncUrl, setCopiedSyncUrl] = useState(false);
    const [copiedPrintUrl, setCopiedPrintUrl] = useState(false);
    const [isSimulating, setIsSimulating] = useState(false);
    const [isSimulatingPrint, setIsSimulatingPrint] = useState(false);
    const [activeTab, setActiveTab] = useState<ProjectTab>('overview');
    const [origin, setOrigin] = useState('');
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [featuredImages, setFeaturedImages] = useState<CloudinaryImage[]>([]);
    const [loadingFeatured, setLoadingFeatured] = useState(false);
    const [featuredCursor, setFeaturedCursor] = useState<string | null>(null);
    const [loadingMoreFeatured, setLoadingMoreFeatured] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    // AI Models catalog & Cloudinary accounts loaded from Supabase
    const [aiModels, setAiModels] = useState<AiModel[]>(DEFAULT_AI_MODEL_CATALOG);
    const [cloudinaryAccounts, setCloudinaryAccounts] = useState<CloudinaryAccount[]>([]);

    // Overview right-rail Booth Setup quick-edit state
    const [boothLimit, setBoothLimit] = useState(1000);
    const [boothModelId, setBoothModelId] = useState(DEFAULT_AI_MODEL_CATALOG[0].id);
    const [boothRefs, setBoothRefs] = useState(1);
    const [boothSaving, setBoothSaving] = useState(false);
    const [boothSaved, setBoothSaved] = useState(false);

    // Project Settings Tab State
    const [settingsForm, setSettingsForm] = useState<{
        name: string;
        description: string;
        dailyLimit: number;
        referenceImagesCount: number;
        projectType: ProjectPlatformType;
        cloudinaryAccountId: string;
        cloudinaryCloudName: string;
        cloudinaryApiKey: string;
        cloudinaryApiSecret: string;
        cloudinaryFolder: string;
        aiModelId: string;
        aiApiKey: string;
        selectedAiModel: string;
        totalPrintedCopies: number;
    }>({
        name: '',
        description: '',
        dailyLimit: 1000,
        referenceImagesCount: 1,
        projectType: 'desktop',
        cloudinaryAccountId: '',
        cloudinaryCloudName: '',
        cloudinaryApiKey: '',
        cloudinaryApiSecret: '',
        cloudinaryFolder: '',
        aiModelId: DEFAULT_AI_MODEL_CATALOG[0].id,
        aiApiKey: '',
        selectedAiModel: DEFAULT_AI_MODEL_CATALOG[0].name,
        totalPrintedCopies: 0,
    });

    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [settingsSaveSuccess, setSettingsSaveSuccess] = useState(false);
    const [settingsError, setSettingsError] = useState('');
    const [showSecrets, setShowSecrets] = useState<{
        aiApiKey: boolean;
    }>({
        aiApiKey: false,
    });

    // Gallery & Featured state
    const [taggingId, setTaggingId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
    const [dayFilter, setDayFilter] = useState<string>('all');
    const [inspectImage, setInspectImage] = useState<CloudinaryImage | null>(null);
    const [lightboxImage, setLightboxImage] = useState<CloudinaryImage | null>(null);
    const [qrModalImage, setQrModalImage] = useState<CloudinaryImage | null>(null);
    const [deleteImageTargets, setDeleteImageTargets] = useState<CloudinaryImage[]>([]);
    const [isDeletingImages, setIsDeletingImages] = useState(false);
    const [toastState, setToastState] = useState<{
        message: string;
        img?: CloudinaryImage;
    } | null>(null);

    // 2-step Delete Project confirmation dialog
    const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const [mounted, setMounted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [members, setMembers] = useState<any[]>([]);
    const [allProfiles, setAllProfiles] = useState<any[]>([]);
    const [selectedUserIdToAdd, setSelectedUserIdToAdd] = useState('');

    // Bar chart range state
    const [chartRange, setChartRange] = useState<ChartRange>('event');
    const [customRange, setCustomRange] = useState({
        start: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0],
    });

    useEffect(() => {
        setMounted(true);
        setOrigin(window.location.origin);
    }, []);

    useEffect(() => {
        const tabParam = searchParams?.get('tab');
        if (tabParam === 'gallery' || tabParam === 'images') setActiveTab('gallery');
        else if (tabParam === 'featured') setActiveTab('featured');
        else if (tabParam === 'settings') setActiveTab('settings');
        else if (tabParam === 'overview') setActiveTab('overview');
    }, [searchParams]);

    useEffect(() => {
        if (!user || !id) return;
        fetchProjectData();
    }, [id, user, sortOrder]);

    const switchTab = (tab: ProjectTab) => {
        setActiveTab(tab);
        setSelectedIds([]);
        setIsSelectionMode(false);
    };

    const fetchProjectData = async () => {
        setIsLoading(true);
        try {
            const { data: p, error } = await supabase
                .from('projects')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            if (!p) {
                router.push('/projects');
                return;
            }

            const [modelsRes, accRes] = await Promise.all([
                supabase
                    .from('ai_models')
                    .select('*')
                    .order('is_default', { ascending: false })
                    .order('created_at', { ascending: true }),
                supabase
                    .from('cloudinary_accounts')
                    .select('*')
                    .order('is_default', { ascending: false })
                    .order('created_at', { ascending: true }),
            ]);

            let mappedModels: AiModel[] = DEFAULT_AI_MODEL_CATALOG;
            if (!modelsRes.error && Array.isArray(modelsRes.data) && modelsRes.data.length > 0) {
                mappedModels = modelsRes.data.map(m => ({
                    id: m.id,
                    name: m.name,
                    provider: (m.provider === 'gemini' ? 'gemini' : 'openai') as AiProvider,
                    cost1Ref: Number(m.cost_1_ref) || 0,
                    cost2Refs: Number(m.cost_2_refs) || 0,
                    cost3PlusRefs: Number(m.cost_3_plus_refs) || 0,
                    isDefault: Boolean(m.is_default),
                }));
            }
            setAiModels(mappedModels);

            let mappedAccounts: CloudinaryAccount[] = [];
            if (!accRes.error && Array.isArray(accRes.data)) {
                mappedAccounts = accRes.data.map(a => ({
                    id: a.id,
                    label: a.label,
                    cloudName: a.cloud_name,
                    apiKey: a.api_key,
                    apiSecret: a.api_secret,
                    isDefault: Boolean(a.is_default),
                }));
                setCloudinaryAccounts(mappedAccounts);
            }

            const matchedAccount =
                (p.cloudinary_account_id
                    ? mappedAccounts.find(a => a.id === p.cloudinary_account_id)
                    : null) ||
                mappedAccounts.find(a => a.isDefault) ||
                mappedAccounts[0] ||
                null;

            const resolvedAccountId = matchedAccount?.id || p.cloudinary_account_id || '';
            const finalCloudName = matchedAccount?.cloudName || '';
            const finalApiKey = matchedAccount?.apiKey || '';
            const finalApiSecret = matchedAccount?.apiSecret || '';
            const finalFolder = p.cloudinary_folder || p.cloudinary_tag || '';

            const matchedModel =
                (p.ai_model_id ? mappedModels.find(m => m.id === p.ai_model_id) : null) ||
                mappedModels.find(m => m.isDefault) ||
                mappedModels[0] ||
                DEFAULT_AI_MODEL_CATALOG[0];

            const resolvedModelId = matchedModel.id;
            const resolvedSelectedModel = matchedModel.name;
            const resolvedProvider: AiProvider = matchedModel.provider;

            const resolvedAiApiKey = typeof p.ai_api_key === 'string' ? p.ai_api_key : '';

            const resolvedProjectType: ProjectPlatformType =
                p.project_type === 'web' || p.project_type === 'desktop'
                    ? p.project_type
                    : 'desktop';

            const resolvedTotalPrintedCopies = p.total_printed_copies || 0;
            const resolvedRefs = Math.max(
                1,
                typeof p.reference_images_count === 'number' ? p.reference_images_count : 1
            );

            const mapped: Project = {
                id: p.id,
                name: p.name,
                description: p.description || '',
                dailyLimit: p.max_usage || 0,
                currentGenerations: p.total_usage || 0,
                createdAt: p.created_at,
                ownerId: p.created_by || '',
                is_active: p.is_active !== false,
                status: p.is_active === false ? 'paused' : 'active',
                projectType: resolvedProjectType,
                aiModelId: resolvedModelId,
                aiModelProvider: resolvedProvider,
                aiApiKey: resolvedAiApiKey,
                aiModelsList: [resolvedSelectedModel],
                selectedAiModel: resolvedSelectedModel,
                totalPrintedCopies: resolvedTotalPrintedCopies,
                referenceImagesCount: resolvedRefs,
                cloudinaryAccountId: resolvedAccountId || null,
                cloudinaryCloudName: finalCloudName,
                cloudinaryTag: finalFolder,
                cloudinaryFolder: finalFolder,
                cloudinaryApiKey: finalApiKey,
                cloudinaryApiSecret: finalApiSecret,
            };

            setProject(mapped);
            setBoothLimit(mapped.dailyLimit);
            setBoothModelId(resolvedModelId);
            setBoothRefs(resolvedRefs);

            setSettingsForm({
                name: mapped.name,
                description: mapped.description,
                dailyLimit: mapped.dailyLimit,
                referenceImagesCount: resolvedRefs,
                projectType: resolvedProjectType,
                cloudinaryAccountId: resolvedAccountId,
                cloudinaryCloudName: finalCloudName,
                cloudinaryApiKey: finalApiKey,
                cloudinaryApiSecret: finalApiSecret,
                cloudinaryFolder: finalFolder,
                aiModelId: resolvedModelId,
                aiApiKey: resolvedAiApiKey,
                selectedAiModel: resolvedSelectedModel,
                totalPrintedCopies: resolvedTotalPrintedCopies,
            });

            // Fetch all usage logs for this project
            const { data: logsData } = await supabase
                .from('usage_logs')
                .select('*')
                .eq('project_id', id)
                .order('timestamp', { ascending: false });

            setLogs(
                (logsData || []).map((l: any) => ({
                    id: l.id,
                    projectId: l.project_id,
                    timestamp: l.timestamp,
                    amount: l.amount || 1,
                }))
            );

            if (mapped.cloudinaryTag) {
                fetchImages(mapped.cloudinaryTag, mapped, false);
                fetchFeaturedImages(mapped, false);
            }

            // Fetch Members
            const { data: memberData } = await supabase
                .from('project_members')
                .select('id, profiles(id, full_name, email, avatar_url, role)')
                .eq('project_id', id);

            setMembers(
                (memberData || []).map((m: any) => ({
                    memberId: m.id,
                    ...(Array.isArray(m.profiles) ? m.profiles[0] : m.profiles || {}),
                }))
            );

            if (user?.role === UserRole.ADMIN) {
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('id, full_name, email, avatar_url, role');
                setAllProfiles(profileData || []);
            }
        } catch (err) {
            console.error('Error fetching project:', err);
            router.push('/projects');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddMember = async (userId: string) => {
        if (!userId) return;
        try {
            const { error } = await supabase
                .from('project_members')
                .insert([{ project_id: id, user_id: userId }]);
            if (error) throw error;
            setSelectedUserIdToAdd('');
            fetchProjectData();
        } catch (err) {
            console.error('Error adding member:', err);
            alert('User might already be a member of this project.');
        }
    };

    const handleRemoveMember = async (memberId: string) => {
        try {
            const { error } = await supabase
                .from('project_members')
                .delete()
                .eq('id', memberId);
            if (error) throw error;
            fetchProjectData();
        } catch (err) {
            console.error('Error removing member:', err);
        }
    };

    const handleDeleteProject = async () => {
        if (!project) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase
                .from('projects')
                .delete()
                .eq('id', project.id);
            if (error) throw error;
            router.push('/projects');
        } catch (err) {
            console.error('Delete error:', err);
            alert('Failed to delete project. Please try again.');
            setIsDeleting(false);
        }
    };

    const handleToggleProjectActive = async () => {
        if (!project) return;
        const currentlyActive = project.status !== 'paused';
        try {
            const res = await fetch(`/api/projects/${project.id}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !currentlyActive }),
            });
            if (!res.ok) throw new Error('Failed to update project status');
            await fetchProjectData();
        } catch (err) {
            console.error(err);
            alert('Failed to update project status.');
        }
    };

    const handleSaveBoothSetup = async () => {
        if (!project) return;
        setBoothSaving(true);
        try {
            const chosenModel =
                aiModels.find(m => m.id === boothModelId) ||
                aiModels.find(m => m.isDefault) ||
                aiModels[0] ||
                DEFAULT_AI_MODEL_CATALOG[0];

            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                chosenModel.id
            );

            const res = await fetch(`/api/projects/${project.id}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dailyLimit: boothLimit,
                    aiModelId: isUuid ? chosenModel.id : undefined,
                    referenceImagesCount: Math.max(1, boothRefs),
                }),
            });
            if (!res.ok) throw new Error('Failed to save booth setup');
            setBoothSaved(true);
            setTimeout(() => setBoothSaved(false), 2400);
            await fetchProjectData();
        } catch (err) {
            console.error('Error saving booth setup:', err);
            alert('Failed to save booth setup.');
        } finally {
            setBoothSaving(false);
        }
    };

    const handleToggleTag = async (img: CloudinaryImage, showUndoToast = true) => {
        if (!project || taggingId) return;

        const isFeatured = img.tags?.includes('Featured');
        const action = isFeatured ? 'remove' : 'add';
        const tag = 'Featured';

        setTaggingId(img.public_id);
        try {
            const response = await fetch('/api/cloudinary/tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: project.id,
                    accountId: project.cloudinaryAccountId || undefined,
                    public_id: img.public_id,
                    tag,
                    action,
                }),
            });

            if (response.ok) {
                const updatedTags = isFeatured
                    ? (img.tags || []).filter(t => t !== tag)
                    : [...(img.tags || []), tag];
                const updatedImg: CloudinaryImage = { ...img, tags: updatedTags };

                setImages(prev =>
                    prev.map(i => (i.public_id === img.public_id ? updatedImg : i))
                );
                if (inspectImage?.public_id === img.public_id) {
                    setInspectImage(updatedImg);
                }
                if (lightboxImage?.public_id === img.public_id) {
                    setLightboxImage(updatedImg);
                }

                if (isFeatured) {
                    setFeaturedImages(prev => {
                        const remaining = prev.filter(i => i.public_id !== img.public_id);
                        if (remaining.length === 0 && featuredCursor) {
                            fetchFeaturedImages(undefined, true);
                        }
                        return remaining;
                    });
                } else {
                    setFeaturedImages(prev => {
                        if (prev.some(i => i.public_id === img.public_id)) return prev;
                        return [updatedImg, ...prev];
                    });
                }

                if (showUndoToast) {
                    setToastState({
                        message: isFeatured ? 'Removed from Featured' : 'Added to Featured',
                        img: updatedImg,
                    });
                    setTimeout(() => {
                        setToastState(prev => (prev?.img?.public_id === img.public_id ? null : prev));
                    }, 4000);
                }
            } else {
                const errorData = await response.json();
                alert(`Failed to update tag: ${errorData.error}`);
            }
        } catch (err) {
            console.error('Error toggling tag:', err);
        } finally {
            setTaggingId(null);
        }
    };

    const fetchImages = async (tag?: string, currentProject?: Project, append = false) => {
        const p = currentProject || project;
        if (!p) return;

        const activeTag = tag || p.cloudinaryTag || '';
        if (!activeTag) return;

        if (append) setLoadingMore(true);
        else setLoadingImages(true);

        try {
            let url = `/api/cloudinary/images?projectId=${encodeURIComponent(p.id)}&tag=${encodeURIComponent(activeTag)}&sort=${sortOrder}`;
            if (p.cloudinaryCloudName) {
                url += `&cloudName=${encodeURIComponent(p.cloudinaryCloudName)}`;
            }
            if (append && nextCursor) {
                url += `&next_cursor=${nextCursor}`;
            }

            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                if (append) {
                    setImages(prev => {
                        const existingIds = new Set(prev.map(i => i.public_id));
                        const newResources = (data.resources || []).filter((r: any) => !existingIds.has(r.public_id));
                        return [...prev, ...newResources];
                    });
                } else {
                    setImages(data.resources || []);
                }
                setNextCursor(data.next_cursor || null);
            } else {
                if (!append) setImages([]);
            }
        } catch (err) {
            console.error('Error fetching Cloudinary images:', err);
        } finally {
            setLoadingImages(false);
            setLoadingMore(false);
        }
    };

    const fetchFeaturedImages = async (currentProject?: Project, append = false) => {
        const p = currentProject || project;
        if (!p) return;

        const projectTag = p.cloudinaryTag || '';
        if (!projectTag) return;

        if (append) setLoadingMoreFeatured(true);
        else setLoadingFeatured(true);

        try {
            let url = `/api/cloudinary/images?projectId=${encodeURIComponent(p.id)}&tag=${encodeURIComponent(projectTag)}&subtag=Featured&sort=${sortOrder}`;
            if (p.cloudinaryCloudName) {
                url += `&cloudName=${encodeURIComponent(p.cloudinaryCloudName)}`;
            }
            if (append && featuredCursor) {
                url += `&next_cursor=${featuredCursor}`;
            }

            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                if (append) {
                    setFeaturedImages(prev => {
                        const existingIds = new Set(prev.map(i => i.public_id));
                        const newResources = (data.resources || []).filter((r: any) => !existingIds.has(r.public_id));
                        return [...prev, ...newResources];
                    });
                } else {
                    setFeaturedImages(data.resources || []);
                }
                setFeaturedCursor(data.next_cursor || null);
            } else {
                if (!append) setFeaturedImages([]);
            }
        } catch (err) {
            console.error('Error fetching Featured images:', err);
        } finally {
            setLoadingFeatured(false);
            setLoadingMoreFeatured(false);
        }
    };

    const handleSimulateApiCall = async () => {
        if (!project || isSimulating) return;
        setIsSimulating(true);
        try {
            const amount = 1;
            const { error: logError } = await supabase
                .from('usage_logs')
                .insert([{ project_id: project.id, amount }]);
            if (logError) throw logError;

            const { error: updateError } = await supabase.rpc('increment_project_usage', {
                p_id: project.id,
                p_amount: amount,
            });
            if (updateError) throw updateError;
            await fetchProjectData();
        } catch (err) {
            console.error('Simulation error:', err);
            alert('Simulation failed.');
        } finally {
            setIsSimulating(false);
        }
    };

    const handleDownload = async (url: string, filename: string) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Download failed:', error);
            window.open(url + (url.includes('?') ? '&' : '?') + 'fl_attachment', '_blank');
        }
    };

    const getFullImageUrl = (img: CloudinaryImage) =>
        `https://res.cloudinary.com/${project?.cloudinaryCloudName || 'placeholder'}/image/upload/v${img.version}/${img.public_id}.${img.format}`;

    const getThumbImageUrl = (img: CloudinaryImage) =>
        `https://res.cloudinary.com/${project?.cloudinaryCloudName || 'placeholder'}/image/upload/w_500,c_fill,g_auto/v${img.version}/${img.public_id}.${img.format}`;

    const handleDownloadSingleImage = (img: CloudinaryImage) => {
        const dateStr = new Date(img.created_at)
            .toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            })
            .replace(/[,:]/g, '')
            .replace(/\s+/g, '_');
        const fileName = `${project?.name || 'portrait'}_${dateStr}.${img.format}`;
        handleDownload(getFullImageUrl(img), fileName);
    };

    const handleBulkDownload = async (targetImages?: CloudinaryImage[]) => {
        const list =
            targetImages ||
            (activeTab === 'featured' ? featuredImages : filteredGalleryImages).filter(img =>
                selectedIds.includes(img.public_id)
            );
        if (list.length === 0) return;

        for (const img of list) {
            handleDownloadSingleImage(img);
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    };

    const handleConfirmDeleteImages = async () => {
        if (!project || deleteImageTargets.length === 0 || isDeletingImages) return;
        setIsDeletingImages(true);
        const idsToDelete = deleteImageTargets.map(i => i.public_id);

        try {
            const response = await fetch('/api/cloudinary/images', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: project.id,
                    accountId: project.cloudinaryAccountId || undefined,
                    public_ids: idsToDelete,
                }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to delete portrait from Cloudinary');
            }

            const deletedSet = new Set(idsToDelete);
            setImages(prev => prev.filter(i => !deletedSet.has(i.public_id)));
            setFeaturedImages(prev => prev.filter(i => !deletedSet.has(i.public_id)));
            setSelectedIds(prev => prev.filter(idItem => !deletedSet.has(idItem)));

            if (inspectImage && deletedSet.has(inspectImage.public_id)) {
                setInspectImage(null);
            }
            if (lightboxImage && deletedSet.has(lightboxImage.public_id)) {
                setLightboxImage(null);
            }
            if (qrModalImage && deletedSet.has(qrModalImage.public_id)) {
                setQrModalImage(null);
            }

            setDeleteImageTargets([]);
            const deletedCount = idsToDelete.length;
            setToastState({
                message:
                    deletedCount === 1
                        ? 'Portrait deleted from Cloudinary'
                        : `${deletedCount} portraits deleted from Cloudinary`,
            });
            setTimeout(() => {
                setToastState(prev => (prev && !prev.img ? null : prev));
            }, 3500);
        } catch (err: any) {
            console.error('Error deleting portrait(s):', err);
            alert(err?.message || 'Failed to delete portrait from Cloudinary.');
        } finally {
            setIsDeletingImages(false);
        }
    };

    const toggleSelectAll = () => {
        const currentImages = activeTab === 'featured' ? featuredImages : filteredGalleryImages;
        if (selectedIds.length === currentImages.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(currentImages.map(img => img.public_id));
        }
    };

    const toggleImageSelection = (publicId: string) => {
        setSelectedIds(prev =>
            prev.includes(publicId) ? prev.filter(item => item !== publicId) : [...prev, publicId]
        );
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const copyProjectId = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
    };

    const copySyncUrlToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedSyncUrl(true);
        setTimeout(() => setCopiedSyncUrl(false), 2000);
    };

    const copyPrintUrlToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedPrintUrl(true);
        setTimeout(() => setCopiedPrintUrl(false), 2000);
    };

    const handleSaveProjectSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!project) return;

        setIsSavingSettings(true);
        setSettingsSaveSuccess(false);
        setSettingsError('');

        try {
            const chosenModel =
                aiModels.find(m => m.id === settingsForm.aiModelId) ||
                aiModels.find(m => m.name === settingsForm.selectedAiModel) ||
                aiModels.find(m => m.isDefault) ||
                aiModels[0] ||
                DEFAULT_AI_MODEL_CATALOG[0];

            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                chosenModel.id
            );

            const response = await fetch(`/api/projects/${project.id}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: settingsForm.name.trim(),
                    description: settingsForm.description,
                    dailyLimit: settingsForm.dailyLimit,
                    referenceImagesCount: Math.max(1, settingsForm.referenceImagesCount),
                    projectType: settingsForm.projectType,
                    cloudinaryAccountId: settingsForm.cloudinaryAccountId || null,
                    cloudinaryFolder: settingsForm.cloudinaryFolder.trim(),
                    aiModelId: isUuid ? chosenModel.id : undefined,
                    aiApiKey: settingsForm.aiApiKey.trim(),
                    totalPrintedCopies: settingsForm.totalPrintedCopies,
                }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to save project settings');
            }

            setSettingsSaveSuccess(true);
            setTimeout(() => setSettingsSaveSuccess(false), 3000);
            await fetchProjectData();
        } catch (err: any) {
            console.error('Error saving project settings:', err);
            setSettingsError(err.message || 'Failed to save settings.');
        } finally {
            setIsSavingSettings(false);
        }
    };

    const handleSimulatePrintIncrement = async () => {
        if (!project || isSimulatingPrint) return;
        setIsSimulatingPrint(true);
        try {
            const res = await fetch(`/api/projects/${project.id}/print`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ copies: 1 }),
            });
            if (!res.ok) throw new Error('Print increment request failed');
            await fetchProjectData();
        } catch (err) {
            console.error('Simulate print error:', err);
            alert('Failed to simulate print increment.');
        } finally {
            setIsSimulatingPrint(false);
        }
    };

    // Group daily counts from logs + images for Event days / Busiest day / Bar Chart
    const dailyActivityMap = useMemo(() => {
        const map = new Map<string, number>();
        if (logs.length > 0) {
            logs.forEach(l => {
                const d = l.timestamp.split('T')[0];
                map.set(d, (map.get(d) || 0) + (l.amount || 1));
            });
        } else if (images.length > 0) {
            images.forEach(img => {
                const d = new Date(img.created_at).toISOString().split('T')[0];
                map.set(d, (map.get(d) || 0) + 1);
            });
        }
        return map;
    }, [logs, images]);

    const eventDaysSummary = useMemo(() => {
        const entries = Array.from(dailyActivityMap.entries())
            .filter(([, count]) => count > 0)
            .sort((a, b) => a[0].localeCompare(b[0]));

        let busiestDate = '';
        let busiestCount = 0;
        entries.forEach(([d, c]) => {
            if (c > busiestCount) {
                busiestCount = c;
                busiestDate = d;
            }
        });

        const formattedBusiestDate = busiestDate
            ? new Date(busiestDate + 'T12:00:00').toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
              })
            : 'No activity yet';

        const eventDateLabels = entries.map(([d]) =>
            new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        );

        const lastPortraitDate =
            entries.length > 0
                ? new Date(entries[entries.length - 1][0] + 'T12:00:00').toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                  })
                : project?.createdAt
                  ? new Date(project.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                    })
                  : '—';

        return {
            entries,
            busiestCount,
            formattedBusiestDate,
            eventDaysCount: entries.length,
            eventDateLabels: eventDateLabels.slice(-4).join(' · ') || 'No active days yet',
            lastPortraitDate,
        };
    }, [dailyActivityMap, project?.createdAt]);

    const barSeries = useMemo(() => {
        if (chartRange === 'event') {
            return eventDaysSummary.entries.map(([d, count]) => {
                const dt = new Date(d + 'T12:00:00');
                return {
                    dateStr: d,
                    label: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                    sub: dt.toLocaleDateString(undefined, { weekday: 'short' }),
                    count,
                };
            });
        }

        let daysCount = 7;
        let start = new Date();
        let end = new Date();

        if (chartRange === '7d') {
            daysCount = 7;
            start.setDate(end.getDate() - 6);
        } else if (chartRange === '30d') {
            daysCount = 30;
            start.setDate(end.getDate() - 29);
        } else if (chartRange === '90d') {
            daysCount = 90;
            start.setDate(end.getDate() - 89);
        } else if (chartRange === 'all') {
            const allDates = eventDaysSummary.entries.map(([d]) => d);
            if (allDates.length > 0) {
                start = new Date(allDates[0] + 'T00:00:00');
                end = new Date(allDates[allDates.length - 1] + 'T00:00:00');
                daysCount = Math.max(
                    1,
                    Math.min(90, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1)
                );
            } else {
                daysCount = 14;
                start.setDate(end.getDate() - 13);
            }
        } else if (chartRange === 'custom') {
            start = new Date(customRange.start + 'T00:00:00');
            end = new Date(customRange.end + 'T00:00:00');
            daysCount = Math.max(
                1,
                Math.min(90, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1)
            );
        }

        const result: Array<{ dateStr: string; label: string; sub: string; count: number }> = [];
        for (let i = 0; i < daysCount; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            const iso = d.toISOString().split('T')[0];
            result.push({
                dateStr: iso,
                label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                sub: d.toLocaleDateString(undefined, { weekday: 'short' }),
                count: dailyActivityMap.get(iso) || 0,
            });
        }
        return result;
    }, [chartRange, customRange, dailyActivityMap, eventDaysSummary.entries]);

    // Cost computation helper
    const computeCostForModel = (modelIdOrName: string, refsCount: number) => {
        const lower = (modelIdOrName || '').toLowerCase();
        const matched =
            aiModels.find(
                m => m.id.toLowerCase() === lower || m.name.toLowerCase() === lower
            ) ||
            aiModels.find(m => m.isDefault) ||
            aiModels[0] ||
            DEFAULT_AI_MODEL_CATALOG[0];

        const perPortrait = getAiModelPrice(matched, Math.max(1, refsCount));
        return {
            matched,
            perPortrait,
        };
    };

    const boothCost = useMemo(
        () => computeCostForModel(boothModelId, boothRefs),
        [boothModelId, boothRefs, aiModels]
    );

    const settingsCost = useMemo(
        () => computeCostForModel(settingsForm.aiModelId, settingsForm.referenceImagesCount),
        [settingsForm.aiModelId, settingsForm.referenceImagesCount, aiModels]
    );

    // Distinct days in Gallery images
    const galleryDistinctDays = useMemo(() => {
        const set = new Set<string>();
        images.forEach(img => {
            const d = new Date(img.created_at).toISOString().split('T')[0];
            set.add(d);
        });
        return Array.from(set).sort((a, b) => b.localeCompare(a));
    }, [images]);

    const filteredGalleryImages = useMemo(() => {
        if (dayFilter === 'all') return images;
        return images.filter(
            img => new Date(img.created_at).toISOString().split('T')[0] === dayFilter
        );
    }, [images, dayFilter]);

    const processedDetails = useMemo(() => {
        if (!inspectImage) return [];

        const formatMetaValue = (val: unknown): string => {
            if (val === null || val === undefined) return '';
            if (typeof val === 'string') return val;
            if (typeof val === 'number' || typeof val === 'boolean') return String(val);
            if (Array.isArray(val)) {
                return val.map(item => formatMetaValue(item)).filter(Boolean).join(', ');
            }
            try {
                return JSON.stringify(val, null, 2);
            } catch {
                return String(val);
            }
        };

        const rawCtx = inspectImage.context || {};
        const flatCtx: Record<string, unknown> = {};
        Object.entries(rawCtx).forEach(([k, v]) => {
            if (k === 'custom' && v && typeof v === 'object' && !Array.isArray(v)) {
                Object.entries(v as Record<string, unknown>).forEach(([ck, cv]) => {
                    flatCtx[ck] = cv;
                });
            } else {
                flatCtx[k] = v;
            }
        });

        const meta = inspectImage.metadata || {};
        const displayItems: { label: string; value: string }[] = [];

        const promptKeys = Object.keys(flatCtx).filter(k => /^prompt_\d+$/.test(k) || k.startsWith('prompt_'));
        if (promptKeys.length > 0) {
            const sortedPromptKeys = promptKeys.sort((a, b) => {
                const numA = parseInt(a.replace('prompt_', ''), 10) || 0;
                const numB = parseInt(b.replace('prompt_', ''), 10) || 0;
                return numA - numB;
            });
            const fullPrompt = sortedPromptKeys.map(k => formatMetaValue(flatCtx[k])).join('');
            if (fullPrompt.trim()) {
                displayItems.push({ label: 'Full Generation Prompt', value: fullPrompt });
            }
        } else if (flatCtx.prompt) {
            const singlePrompt = formatMetaValue(flatCtx.prompt);
            if (singlePrompt.trim()) {
                displayItems.push({ label: 'Full Generation Prompt', value: singlePrompt });
            }
        }

        Object.entries(flatCtx).forEach(([key, value]) => {
            if (!key.startsWith('prompt_') && !(key === 'prompt' && promptKeys.length === 0)) {
                const formatted = formatMetaValue(value);
                if (formatted.trim()) {
                    displayItems.push({ label: key.replace(/_/g, ' '), value: formatted });
                }
            }
        });

        Object.entries(meta).forEach(([key, value]) => {
            const formatted = formatMetaValue(value);
            if (formatted.trim()) {
                displayItems.push({ label: key.replace(/_/g, ' '), value: formatted });
            }
        });

        return displayItems;
    }, [inspectImage]);

    if (isLoading || !project || !user) {
        return (
            <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <Loader2 className="animate-spin" style={{ color: 'var(--pink)' }} size={36} />
                    <span className="lbl">Loading project…</span>
                </div>
            </div>
        );
    }

    const usagePercent =
        project.dailyLimit > 0 ? (project.currentGenerations / project.dailyLimit) * 100 : 0;
    const remainingPortraits = Math.max(0, project.dailyLimit - project.currentGenerations);
    const badgeState = getProjectBadgeState(project);
    const isAdmin = user.role === UserRole.ADMIN;

    const currentModalImageList =
        activeTab === 'featured' ? featuredImages : filteredGalleryImages;
    const lightboxIndex = lightboxImage
        ? currentModalImageList.findIndex(i => i.public_id === lightboxImage.public_id)
        : -1;
    const inspectIndex = inspectImage
        ? currentModalImageList.findIndex(i => i.public_id === inspectImage.public_id)
        : -1;

    const availableProfilesToAdd = allProfiles.filter(
        p => !members.some(m => m.id === p.id)
    );

    const maxBarCount = Math.max(...barSeries.map(d => d.count), 1);
    const totalSeriesPortraits = barSeries.reduce((acc, d) => acc + d.count, 0);

    return (
        <>
            {/* Top Back Link */}
            <Link
                href="/projects"
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: 'none',
                    minHeight: 36,
                    alignSelf: 'flex-start',
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
                    <path d="M15 6l-6 6 6 6" />
                </svg>
                All projects
            </Link>

            {/* Top Project Header */}
            <header
                className="emerge"
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    gap: 24,
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <span className={`pill ${badgeState.pillClass}`}>
                            <i
                                aria-hidden="true"
                                className={badgeState.isLive ? 'live' : undefined}
                            />
                            {badgeState.label}
                        </span>
                        <span className="pill p-sand">
                            <i aria-hidden="true" />
                            {project.projectType === 'web' ? 'Web' : 'Desktop'}
                        </span>
                        <span className="lbl">Last portrait {eventDaysSummary.lastPortraitDate}</span>
                    </div>

                    <h1
                        style={{
                            margin: 0,
                            fontSize: 'clamp(28px, 3.4vw, 44px)',
                            fontWeight: 300,
                            letterSpacing: '.04em',
                            textTransform: 'uppercase',
                            lineHeight: 1.1,
                        }}
                    >
                        {project.name}
                    </h1>
                </div>

                {activeTab !== 'overview' && (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            minWidth: 'min(280px, 100%)',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: 13,
                            }}
                        >
                            <span style={{ fontWeight: 600 }}>
                                {project.currentGenerations.toLocaleString()} of{' '}
                                {project.dailyLimit.toLocaleString()} portraits
                            </span>
                            <span style={{ color: '#5C5C66' }}>
                                {remainingPortraits.toLocaleString()} left
                            </span>
                        </div>
                        <div
                            style={{
                                height: 4,
                                background: '#E3DFD8',
                                borderRadius: 2,
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                className="fill"
                                style={{
                                    width: `${Math.min(100, usagePercent)}%`,
                                    height: 4,
                                    borderRadius: 2,
                                    background: '#FF0066',
                                }}
                            />
                        </div>
                    </div>
                )}
            </header>

            {/* Tab Bar */}
            <div
                className="tabsrow"
                role="tablist"
                aria-label="Project sections"
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 32,
                    borderBottom: '1px solid #E3DFD8',
                }}
            >
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'overview'}
                    onClick={() => switchTab('overview')}
                    className={`tab${activeTab === 'overview' ? ' on' : ''}`}
                >
                    Overview
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'gallery'}
                    onClick={() => switchTab('gallery')}
                    className={`tab${activeTab === 'gallery' ? ' on' : ''}`}
                >
                    Gallery
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'featured'}
                    onClick={() => switchTab('featured')}
                    className={`tab${activeTab === 'featured' ? ' on' : ''}`}
                >
                    Featured
                </button>
                {isAdmin && (
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'settings'}
                        onClick={() => switchTab('settings')}
                        className={`tab${activeTab === 'settings' ? ' on' : ''}`}
                    >
                        Settings
                    </button>
                )}
            </div>

            {/* ======================== OVERVIEW TAB ======================== */}
            {activeTab === 'overview' && (
                <section
                    className="ovgrid"
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1.55fr) minmax(300px, 1fr)',
                        gap: 20,
                        alignItems: 'start',
                    }}
                >
                    {/* Left Column */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {/* Real-time Usage Card + Printed Copies Counter */}
                        <div className="card lift" style={{ padding: 28 }}>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    gap: 16,
                                    flexWrap: 'wrap',
                                }}
                            >
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 36 }}>
                                    <div>
                                        <span className="lbl">Real-time usage</span>
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'baseline',
                                                gap: 10,
                                                marginTop: 8,
                                            }}
                                        >
                                            <span
                                                style={{
                                                    fontWeight: 800,
                                                    fontSize: 56,
                                                    letterSpacing: '-.04em',
                                                    lineHeight: 0.92,
                                                    color: 'var(--pink)',
                                                }}
                                            >
                                                {project.currentGenerations.toLocaleString()}
                                            </span>
                                            <span
                                                style={{
                                                    fontSize: 20,
                                                    color: 'var(--muted)',
                                                    fontWeight: 500,
                                                }}
                                            >
                                                / {project.dailyLimit.toLocaleString()} portraits
                                            </span>
                                        </div>
                                    </div>

                                    {project.projectType !== 'web' && (
                                        <div
                                            style={{
                                                paddingLeft: 32,
                                                borderLeft: '1px solid #E3DFD8',
                                            }}
                                        >
                                            <span
                                                className="lbl"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                            >
                                                <Printer size={12} style={{ color: '#0B7A4B' }} />
                                                Printed copies
                                            </span>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'baseline',
                                                    gap: 10,
                                                    marginTop: 8,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontWeight: 800,
                                                        fontSize: 56,
                                                        letterSpacing: '-.04em',
                                                        lineHeight: 0.92,
                                                        color: 'var(--void)',
                                                    }}
                                                >
                                                    {(project.totalPrintedCopies || 0).toLocaleString()}
                                                </span>
                                                <span
                                                    style={{
                                                        fontSize: 20,
                                                        color: 'var(--muted)',
                                                        fontWeight: 500,
                                                    }}
                                                >
                                                    copies
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <span className={`pill ${badgeState.pillClass}`}>
                                    <i
                                        aria-hidden="true"
                                        className={badgeState.isLive ? 'live' : undefined}
                                    />
                                    {badgeState.label}
                                </span>
                            </div>

                            <div
                                style={{
                                    marginTop: 22,
                                    height: 10,
                                    background: '#E3DFD8',
                                    borderRadius: 5,
                                    overflow: 'hidden',
                                }}
                            >
                                <div
                                    className="fill"
                                    style={{
                                        width: `${Math.min(100, usagePercent)}%`,
                                        height: '100%',
                                        background: 'var(--pink)',
                                        borderRadius: 5,
                                    }}
                                />
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginTop: 10,
                                    fontSize: 13,
                                }}
                            >
                                <span style={{ color: 'var(--muted)' }}>
                                    {usagePercent.toFixed(1)}% of the limit used
                                </span>
                                <span style={{ fontWeight: 700 }}>
                                    {remainingPortraits.toLocaleString()} remaining
                                </span>
                            </div>
                        </div>

                        {/* 3 Mini KPI Cards */}
                        <div
                            className="stagger"
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                gap: 14,
                            }}
                        >
                            <div className="card lift" style={{ padding: 20 }}>
                                <span className="lbl">Busiest day</span>
                                <div
                                    style={{
                                        fontWeight: 800,
                                        fontSize: 28,
                                        letterSpacing: '-.03em',
                                        marginTop: 8,
                                    }}
                                >
                                    {eventDaysSummary.busiestCount}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                                    {eventDaysSummary.formattedBusiestDate}
                                </div>
                            </div>

                            <div className="card lift" style={{ padding: 20 }}>
                                <span className="lbl">Event days</span>
                                <div
                                    style={{
                                        fontWeight: 800,
                                        fontSize: 28,
                                        letterSpacing: '-.03em',
                                        marginTop: 8,
                                    }}
                                >
                                    {eventDaysSummary.eventDaysCount}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                                    {eventDaysSummary.eventDateLabels}
                                </div>
                            </div>

                            <div className="card lift" style={{ padding: 20 }}>
                                <span className="lbl">Featured</span>
                                <div
                                    style={{
                                        fontWeight: 800,
                                        fontSize: 28,
                                        letterSpacing: '-.03em',
                                        marginTop: 8,
                                        color: 'var(--pink)',
                                    }}
                                >
                                    {featuredImages.length}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                                    on the carousel
                                </div>
                            </div>
                        </div>

                        {/* Portraits per day Bar Chart */}
                        <div className="card" style={{ padding: 28 }}>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    gap: 16,
                                    flexWrap: 'wrap',
                                    marginBottom: 20,
                                }}
                            >
                                <div>
                                    <span className="lbl">Portraits per day</span>
                                    <h3
                                        style={{
                                            fontWeight: 800,
                                            fontSize: 22,
                                            letterSpacing: '-.02em',
                                            margin: '4px 0 0',
                                        }}
                                    >
                                        {totalSeriesPortraits.toLocaleString()}{' '}
                                        <span
                                            style={{
                                                fontWeight: 500,
                                                fontSize: 14,
                                                color: 'var(--muted)',
                                            }}
                                        >
                                            {chartRange === 'event'
                                                ? `across ${barSeries.length} active days`
                                                : `across ${barSeries.length} days`}
                                        </span>
                                    </h3>
                                </div>

                                <div
                                    style={{
                                        display: 'flex',
                                        gap: 8,
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                    }}
                                >
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
                                        {(
                                            [
                                                ['event', 'Event days'],
                                                ['7d', '7 days'],
                                                ['30d', '30 days'],
                                                ['90d', '90 days'],
                                                ['all', 'All time'],
                                                ['custom', 'Custom…'],
                                            ] as Array<[ChartRange, string]>
                                        ).map(([key, label]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                aria-pressed={chartRange === key}
                                                className={`seg${chartRange === key ? ' on' : ''}`}
                                                onClick={() => setChartRange(key)}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {chartRange === 'custom' && (
                                <div
                                    style={{
                                        display: 'flex',
                                        gap: 8,
                                        alignItems: 'center',
                                        marginBottom: 18,
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <input
                                        type="date"
                                        className="field"
                                        style={{ width: 'auto', padding: '7px 11px', fontSize: 12 }}
                                        value={customRange.start}
                                        onChange={e =>
                                            setCustomRange(prev => ({ ...prev, start: e.target.value }))
                                        }
                                    />
                                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>to</span>
                                    <input
                                        type="date"
                                        className="field"
                                        style={{ width: 'auto', padding: '7px 11px', fontSize: 12 }}
                                        value={customRange.end}
                                        onChange={e =>
                                            setCustomRange(prev => ({ ...prev, end: e.target.value }))
                                        }
                                    />
                                </div>
                            )}

                            {barSeries.length === 0 || totalSeriesPortraits === 0 ? (
                                <div
                                    style={{
                                        height: 220,
                                        display: 'grid',
                                        placeItems: 'center',
                                        background: 'var(--ground)',
                                        borderRadius: 12,
                                        textAlign: 'center',
                                        padding: 20,
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 15 }}>
                                            No portraits in this period
                                        </div>
                                        <div
                                            style={{
                                                fontSize: 12,
                                                color: 'var(--muted)',
                                                marginTop: 4,
                                            }}
                                        >
                                            {eventDaysSummary.entries.length > 0
                                                ? 'Switch to Event days to see active booth dates.'
                                                : 'Portraits will appear here once the photobooth generates photos.'}
                                        </div>
                                        {chartRange !== 'event' && eventDaysSummary.entries.length > 0 && (
                                            <button
                                                type="button"
                                                className="btn"
                                                style={{
                                                    marginTop: 12,
                                                    padding: '7px 14px',
                                                    fontSize: 12,
                                                }}
                                                onClick={() => setChartRange('event')}
                                            >
                                                Show event days
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div
                                    style={{
                                        height: 220,
                                        display: 'grid',
                                        gridTemplateColumns: `repeat(${barSeries.length}, minmax(0, 1fr))`,
                                        gap: barSeries.length > 30 ? 3 : barSeries.length > 14 ? 6 : 12,
                                        alignItems: 'end',
                                        paddingTop: 24,
                                    }}
                                >
                                    {barSeries.map((d, i) => {
                                        const hPct =
                                            d.count === 0
                                                ? 3
                                                : Math.max(10, Math.round((d.count / maxBarCount) * 100));
                                        const isPeak = d.count === maxBarCount && d.count > 0;
                                        const showEvery =
                                            barSeries.length > 40 ? 7 : barSeries.length > 16 ? 3 : 1;

                                        return (
                                            <div
                                                key={d.dateStr}
                                                title={`${d.label}: ${d.count} portraits`}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    height: '100%',
                                                    justifyContent: 'flex-end',
                                                    gap: 6,
                                                }}
                                            >
                                                {barSeries.length <= 14 && (
                                                    <span
                                                        style={{
                                                            fontSize: 12,
                                                            fontWeight: 700,
                                                            color: isPeak
                                                                ? 'var(--pink)'
                                                                : d.count
                                                                  ? 'var(--ink)'
                                                                  : 'var(--muted)',
                                                        }}
                                                    >
                                                        {d.count}
                                                    </span>
                                                )}
                                                <div
                                                    className="bar"
                                                    style={{
                                                        width: '100%',
                                                        maxWidth: 56,
                                                        height: `${hPct}%`,
                                                        borderRadius:
                                                            barSeries.length > 30
                                                                ? '3px 3px 2px 2px'
                                                                : '8px 8px 4px 4px',
                                                        background: isPeak
                                                            ? 'var(--pink)'
                                                            : d.count
                                                              ? 'var(--void)'
                                                              : 'var(--hair)',
                                                        boxShadow: isPeak
                                                            ? '0 8px 20px -4px rgba(255,0,102,.45)'
                                                            : 'none',
                                                        animationDelay: `${Math.min(i * 18, 400)}ms`,
                                                    }}
                                                />
                                                <div
                                                    style={{
                                                        textAlign: 'center',
                                                        lineHeight: 1.15,
                                                        minHeight: 26,
                                                    }}
                                                >
                                                    {i % showEvery === 0 && (
                                                        <>
                                                            <div
                                                                style={{
                                                                    fontSize: 11,
                                                                    fontWeight: 600,
                                                                    whiteSpace: 'nowrap',
                                                                }}
                                                            >
                                                                {d.label}
                                                            </div>
                                                            {barSeries.length <= 14 && (
                                                                <div
                                                                    style={{
                                                                        fontSize: 10,
                                                                        color: 'var(--muted)',
                                                                    }}
                                                                >
                                                                    {d.sub}
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {/* Booth Setup Card */}
                        {isAdmin ? (
                            <div
                                className="card"
                                style={{ padding: 24, borderTop: '2px solid var(--pink)' }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: 14,
                                    }}
                                >
                                    <div>
                                        <span className="lbl" style={{ color: 'var(--pink)' }}>
                                            Admin · Booth setup
                                        </span>
                                        <h3
                                            style={{
                                                fontWeight: 700,
                                                fontSize: 16,
                                                margin: '2px 0 0',
                                            }}
                                        >
                                            Limit, model &amp; cost
                                        </h3>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-pink"
                                        onClick={handleSaveBoothSetup}
                                        disabled={boothSaving}
                                        style={{ padding: '7px 13px', fontSize: 12 }}
                                    >
                                        {boothSaving ? 'Saving…' : boothSaved ? '✓ Saved' : 'Save'}
                                    </button>
                                </div>

                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: 10,
                                        marginBottom: 10,
                                    }}
                                >
                                    <div>
                                        <label
                                            className="lbl"
                                            style={{ display: 'block', marginBottom: 6 }}
                                        >
                                            Portrait limit
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            className="field"
                                            value={boothLimit}
                                            onChange={e =>
                                                setBoothLimit(Math.max(1, parseInt(e.target.value) || 0))
                                            }
                                        />
                                    </div>
                                    <div>
                                        <label
                                            className="lbl"
                                            style={{ display: 'block', marginBottom: 6 }}
                                        >
                                            Reference images
                                        </label>
                                        <select
                                            className="field"
                                            value={boothRefs}
                                            onChange={e =>
                                                setBoothRefs(Math.max(1, Number(e.target.value) || 1))
                                            }
                                        >
                                            <option value={1}>1 · face</option>
                                            <option value={2}>2 · face + style</option>
                                            <option value={3}>2+ · face + style + bg</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ marginBottom: 14 }}>
                                    <label
                                        className="lbl"
                                        style={{ display: 'block', marginBottom: 6 }}
                                    >
                                        AI model
                                    </label>
                                    <select
                                        className="field"
                                        value={boothModelId}
                                        onChange={e => setBoothModelId(e.target.value)}
                                    >
                                        {aiModels.map(m => (
                                            <option key={m.id} value={m.id}>
                                                {m.name} ({m.provider === 'gemini' ? 'Gemini' : 'OpenAI'})
                                                {m.isDefault ? ' · Default' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div
                                    style={{
                                        background: 'var(--ground)',
                                        borderRadius: 12,
                                        padding: 14,
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr 1fr',
                                        gap: 10,
                                    }}
                                >
                                    <div>
                                        <span className="lbl">Per portrait</span>
                                        <div
                                            style={{
                                                fontWeight: 800,
                                                fontSize: 18,
                                                marginTop: 4,
                                            }}
                                        >
                                            ${boothCost.perPortrait.toFixed(3).replace(/0$/, '')}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: 10,
                                                color: 'var(--muted)',
                                                marginTop: 2,
                                            }}
                                        >
                                            {boothRefs >= 3
                                                ? '2+ ref images'
                                                : `${boothRefs} ref image${boothRefs > 1 ? 's' : ''}`}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="lbl">Spent so far</span>
                                        <div
                                            style={{
                                                fontWeight: 800,
                                                fontSize: 18,
                                                marginTop: 4,
                                                color: 'var(--pink)',
                                            }}
                                        >
                                            $
                                            {(
                                                project.currentGenerations * boothCost.perPortrait
                                            ).toFixed(2)}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: 10,
                                                color: 'var(--muted)',
                                                marginTop: 2,
                                            }}
                                        >
                                            {project.currentGenerations.toLocaleString()} made
                                        </div>
                                    </div>
                                    <div>
                                        <span className="lbl">At full limit</span>
                                        <div
                                            style={{
                                                fontWeight: 800,
                                                fontSize: 18,
                                                marginTop: 4,
                                            }}
                                        >
                                            ${(boothLimit * boothCost.perPortrait).toFixed(2)}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: 10,
                                                color: 'var(--muted)',
                                                marginTop: 2,
                                            }}
                                        >
                                            {boothLimit.toLocaleString()} max
                                        </div>
                                    </div>
                                </div>

                                <div
                                    style={{
                                        fontSize: 11,
                                        color: 'var(--muted)',
                                        marginTop: 10,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                    }}
                                >
                                    <span>Prices come from Image models catalog</span>
                                    <Link
                                        href="/settings"
                                        style={{
                                            color: 'var(--ink)',
                                            fontWeight: 600,
                                            textDecoration: 'none',
                                        }}
                                    >
                                        Manage models →
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <div className="card" style={{ padding: 24 }}>
                                <span className="lbl">Booth setup</span>
                                <h3
                                    style={{
                                        fontWeight: 700,
                                        fontSize: 16,
                                        margin: '4px 0 12px',
                                    }}
                                >
                                    Active configuration
                                </h3>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    <span className="pill pill-muted">
                                        Limit {project.dailyLimit.toLocaleString()}
                                    </span>
                                    <span className="pill pill-muted">
                                        {project.selectedAiModel || 'gpt-image-2.6-flare'}
                                    </span>
                                    <span className="pill pill-muted">
                                        {(project.referenceImagesCount ?? 1) >= 3
                                            ? '2+ references'
                                            : `${Math.max(1, project.referenceImagesCount ?? 1)} reference${
                                                  (project.referenceImagesCount ?? 1) > 1 ? 's' : ''
                                              }`}
                                    </span>
                                </div>
                                <p
                                    style={{
                                        fontSize: 12,
                                        color: 'var(--muted)',
                                        margin: '12px 0 0',
                                    }}
                                >
                                    Only admins can change the booth setup.
                                </p>
                            </div>
                        )}

                        {/* Team Members Card */}
                        <div className="card" style={{ padding: 24 }}>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 14,
                                }}
                            >
                                <h3 style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>
                                    Team members
                                </h3>
                                <span className="lbl">{members.length} assigned</span>
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 10,
                                    marginBottom: isAdmin ? 16 : 0,
                                }}
                            >
                                {members.map((member, idx) => {
                                    const [bgTint, fgTint] =
                                        AVATAR_TINTS[idx % AVATAR_TINTS.length];
                                    return (
                                        <div
                                            key={member.memberId || member.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 10,
                                                padding: 10,
                                                borderRadius: 10,
                                                background: 'var(--ground)',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: 34,
                                                    height: 34,
                                                    borderRadius: 99,
                                                    background: bgTint,
                                                    color: fgTint,
                                                    display: 'grid',
                                                    placeItems: 'center',
                                                    fontWeight: 800,
                                                    fontSize: 12,
                                                    flexShrink: 0,
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {member.avatar_url ? (
                                                    <img
                                                        src={member.avatar_url}
                                                        alt={member.full_name || ''}
                                                        style={{
                                                            width: '100%',
                                                            height: '100%',
                                                            objectFit: 'cover',
                                                        }}
                                                    />
                                                ) : (
                                                    getInitials(member.full_name, member.email)
                                                )}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div
                                                    style={{
                                                        fontWeight: 600,
                                                        fontSize: 13,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {member.full_name || 'Member'}
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: 11,
                                                        color: 'var(--muted)',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {member.email}
                                                </div>
                                            </div>
                                            {isAdmin && (
                                                <button
                                                    type="button"
                                                    className="icon-btn"
                                                    title="Remove from project"
                                                    onClick={() =>
                                                        handleRemoveMember(member.memberId)
                                                    }
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}

                                {members.length === 0 && (
                                    <div
                                        style={{
                                            padding: '14px 10px',
                                            textAlign: 'center',
                                            fontSize: 12,
                                            color: 'var(--muted)',
                                            background: 'var(--ground)',
                                            borderRadius: 10,
                                        }}
                                    >
                                        No members assigned yet
                                    </div>
                                )}
                            </div>

                            {isAdmin && (
                                <>
                                    <label
                                        className="lbl"
                                        style={{ display: 'block', marginBottom: 6 }}
                                    >
                                        Add a person
                                    </label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <select
                                            className="field"
                                            value={selectedUserIdToAdd}
                                            onChange={e => setSelectedUserIdToAdd(e.target.value)}
                                        >
                                            <option value="">
                                                {availableProfilesToAdd.length
                                                    ? 'Choose a team member…'
                                                    : 'Everyone is on this project'}
                                            </option>
                                            {availableProfilesToAdd.map(p => (
                                                <option key={p.id} value={p.id}>
                                                    {p.full_name || p.email} · {p.email}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className="btn"
                                            disabled={!selectedUserIdToAdd}
                                            onClick={() => handleAddMember(selectedUserIdToAdd)}
                                            style={{ flexShrink: 0 }}
                                        >
                                            Add
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Project Settings Summary Card (Admin) */}
                        {isAdmin && (
                            <div className="card" style={{ padding: 24 }}>
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: 14,
                                    }}
                                >
                                    <h3 style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>
                                        Project settings
                                    </h3>
                                    <button
                                        type="button"
                                        className="btn"
                                        style={{ padding: '6px 11px', fontSize: 12 }}
                                        onClick={() => switchTab('settings')}
                                    >
                                        Edit
                                    </button>
                                </div>

                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 12,
                                        fontSize: 13,
                                    }}
                                >
                                    <div
                                        style={{
                                            padding: 12,
                                            borderRadius: 10,
                                            background: 'var(--ground)',
                                        }}
                                    >
                                        <span className="lbl">Cloudinary cloud</span>
                                        <div style={{ fontWeight: 600, marginTop: 3 }}>
                                            {project.cloudinaryCloudName ||
                                                'Managed via Global Settings'}
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            padding: 12,
                                            borderRadius: 10,
                                            background: 'var(--ground)',
                                        }}
                                    >
                                        <span className="lbl">Tag / folder path</span>
                                        <div
                                            style={{
                                                fontWeight: 600,
                                                marginTop: 3,
                                                color: 'var(--pink)',
                                            }}
                                        >
                                            #{project.cloudinaryFolder || project.cloudinaryTag || 'Not set'}
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            padding: 12,
                                            borderRadius: 10,
                                            background: 'var(--ground)',
                                        }}
                                    >
                                        <span className="lbl">API security</span>
                                        <div
                                            style={{
                                                display: 'flex',
                                                gap: 6,
                                                marginTop: 6,
                                                flexWrap: 'wrap',
                                            }}
                                        >
                                        <span className="pill p-use">
                                            <i aria-hidden="true" />
                                            SDK protected
                                        </span>
                                        <span className="pill p-gray">
                                            <i aria-hidden="true" />
                                            Supabase secure
                                        </span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    className="btn btn-danger"
                                    onClick={() => {
                                        setDeleteConfirmText('');
                                        setDeleteStep(1);
                                    }}
                                    style={{
                                        width: '100%',
                                        justifyContent: 'center',
                                        marginTop: 14,
                                    }}
                                >
                                    Delete project…
                                </button>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* ======================== GALLERY TAB ======================== */}
            {activeTab === 'gallery' && (
                <section>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 12,
                            marginBottom: 18,
                            flexWrap: 'wrap',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                gap: 8,
                                alignItems: 'center',
                                flexWrap: 'wrap',
                            }}
                        >
                            <select
                                className="field"
                                style={{ width: 'auto', padding: '9px 12px', fontSize: 12 }}
                                value={dayFilter}
                                onChange={e => setDayFilter(e.target.value)}
                            >
                                <option value="all">
                                    All days
                                </option>
                                {galleryDistinctDays.map(d => (
                                    <option key={d} value={d}>
                                        {new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                        })}
                                    </option>
                                ))}
                            </select>

                            <select
                                className="field"
                                style={{ width: 'auto', padding: '9px 12px', fontSize: 12 }}
                                value={sortOrder}
                                onChange={e => setSortOrder(e.target.value as 'desc' | 'asc')}
                            >
                                <option value="desc">Newest first</option>
                                <option value="asc">Oldest first</option>
                            </select>

                            <button
                                type="button"
                                className="btn"
                                style={{ padding: '9px 12px', fontSize: 12 }}
                                onClick={() => fetchImages()}
                            >
                                <RefreshCw
                                    size={13}
                                    className={loadingImages ? 'animate-spin' : ''}
                                />
                                Refresh
                            </button>

                            <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4 }}>
                                Showing{' '}
                                <b style={{ color: 'var(--void)' }}>
                                    {filteredGalleryImages.length}
                                </b>{' '}
                                {nextCursor ? 'loaded portraits' : 'portraits'}
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {!isSelectionMode ? (
                                <>
                                    <button
                                        type="button"
                                        className="btn"
                                        onClick={() => setIsSelectionMode(true)}
                                    >
                                        Select
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-pink"
                                        disabled={filteredGalleryImages.length === 0}
                                        onClick={() => handleBulkDownload(filteredGalleryImages)}
                                    >
                                        ⤓ Download all
                                    </button>
                                </>
                            ) : (
                                <>
                                    <span className="pill p-pink">
                                        {selectedIds.length} selected
                                    </span>
                                    <button
                                        type="button"
                                        className="btn"
                                        onClick={toggleSelectAll}
                                    >
                                        {selectedIds.length === filteredGalleryImages.length &&
                                        filteredGalleryImages.length > 0
                                            ? 'Clear all'
                                            : 'Select all'}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn"
                                        onClick={() => {
                                            setIsSelectionMode(false);
                                            setSelectedIds([]);
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-danger"
                                        disabled={selectedIds.length === 0}
                                        onClick={() => {
                                            const targets = filteredGalleryImages.filter(img =>
                                                selectedIds.includes(img.public_id)
                                            );
                                            if (targets.length > 0) {
                                                setDeleteImageTargets(targets);
                                            }
                                        }}
                                    >
                                        <Trash2 size={14} /> Delete {selectedIds.length || ''}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-pink"
                                        disabled={selectedIds.length === 0}
                                        onClick={() => handleBulkDownload()}
                                    >
                                        ⤓ Download {selectedIds.length || ''}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {!project.cloudinaryTag ? (
                        <div
                            className="card"
                            style={{ padding: 48, textAlign: 'center' }}
                        >
                            <div style={{ fontWeight: 700, fontSize: 16 }}>
                                Cloudinary folder not configured
                            </div>
                            <p
                                style={{
                                    color: 'var(--muted)',
                                    fontSize: 13,
                                    maxWidth: 380,
                                    margin: '6px auto 16px',
                                }}
                            >
                                Set a Cloudinary folder/tag in the project settings to view generated
                                portraits.
                            </p>
                            {isAdmin && (
                                <button
                                    type="button"
                                    className="btn btn-pink"
                                    onClick={() => switchTab('settings')}
                                >
                                    Open Settings
                                </button>
                            )}
                        </div>
                    ) : loadingImages ? (
                        <div
                            className="galgrid"
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                                gap: 20,
                            }}
                        >
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                                <div
                                    key={n}
                                    className="tile"
                                    style={{ background: '#E3DFD8' }}
                                />
                            ))}
                        </div>
                    ) : filteredGalleryImages.length === 0 ? (
                        <div
                            className="card"
                            style={{ padding: 48, textAlign: 'center' }}
                        >
                            <div style={{ fontWeight: 700, fontSize: 16 }}>
                                No portraits found
                            </div>
                            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>
                                New portraits generated by the booth will appear here automatically.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div
                                className="stagger galgrid"
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                                    gap: 20,
                                }}
                            >
                                {filteredGalleryImages.map(img => {
                                    const isFeatured = Boolean(img.tags?.includes('Featured'));
                                    const isSel = selectedIds.includes(img.public_id);
                                    const timeLabel = new Date(img.created_at).toLocaleString(
                                        undefined,
                                        {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        }
                                    );

                                    return (
                                        <div
                                            key={img.public_id}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 8,
                                                minWidth: 0,
                                            }}
                                        >
                                            <div
                                                className="tile"
                                                style={{
                                                    position: 'relative',
                                                    aspectRatio: '2 / 3',
                                                    borderRadius: 4,
                                                    background: '#E3DFD8',
                                                    overflow: 'hidden',
                                                    outline: isSel ? '2px solid #FF0066' : 'none',
                                                    outlineOffset: 3,
                                                    transform: isSel ? 'scale(0.98)' : undefined,
                                                }}
                                            >
                                                <img
                                                    src={getThumbImageUrl(img)}
                                                    alt={img.public_id}
                                                    loading="lazy"
                                                    style={{
                                                        position: 'absolute',
                                                        inset: 0,
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'cover',
                                                        display: 'block',
                                                    }}
                                                />

                                                {isSelectionMode ? (
                                                    <button
                                                        type="button"
                                                        className="selhit"
                                                        aria-pressed={isSel}
                                                        aria-label={`Select portrait ${img.public_id}`}
                                                        onClick={() =>
                                                            toggleImageSelection(img.public_id)
                                                        }
                                                        style={{
                                                            backgroundColor: isSel
                                                                ? 'rgba(255,0,102,.14)'
                                                                : undefined,
                                                        }}
                                                    >
                                                        <span
                                                            className={`check${isSel ? ' on' : ''}`}
                                                            aria-hidden="true"
                                                        >
                                                            <svg
                                                                width="16"
                                                                height="16"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="3"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                            >
                                                                <path d="M5 12.5l4.5 4.5L19 7.5" />
                                                            </svg>
                                                        </span>
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="viewhit"
                                                        aria-label="Open full view"
                                                        onClick={() => setLightboxImage(img)}
                                                    >
                                                        <span>
                                                            <svg
                                                                aria-hidden="true"
                                                                width="14"
                                                                height="14"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2.2"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                            >
                                                                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                                                            </svg>
                                                            Full view
                                                        </span>
                                                    </button>
                                                )}

                                                {isFeatured && !isSelectionMode && (
                                                    <span
                                                        className="lbl"
                                                        style={{
                                                            position: 'absolute',
                                                            top: 12,
                                                            right: 12,
                                                            pointerEvents: 'none',
                                                            fontSize: 10,
                                                            color: '#050507',
                                                            background: '#FF0066',
                                                            padding: '4px 8px',
                                                            borderRadius: 2,
                                                            zIndex: 2,
                                                        }}
                                                    >
                                                        Featured
                                                    </span>
                                                )}
                                            </div>

                                            <div
                                                className="tilerow"
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: 4,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontSize: 12,
                                                        color: '#5C5C66',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        minWidth: 0,
                                                    }}
                                                >
                                                    {timeLabel}
                                                </span>

                                                <div style={{ display: 'flex', flex: 'none' }}>
                                                    <button
                                                        type="button"
                                                        className={`icon-btn${isFeatured ? ' star-on' : ''}`}
                                                        style={{ width: 28, height: 28 }}
                                                        aria-pressed={isFeatured}
                                                        title={
                                                            isFeatured
                                                                ? 'Remove from Featured'
                                                                : 'Add to Featured'
                                                        }
                                                        disabled={taggingId === img.public_id}
                                                        onClick={() => handleToggleTag(img)}
                                                    >
                                                        <svg
                                                            aria-hidden="true"
                                                            width="16"
                                                            height="16"
                                                            viewBox="0 0 24 24"
                                                            fill={isFeatured ? 'currentColor' : 'none'}
                                                            stroke="currentColor"
                                                            strokeWidth="2"
                                                            strokeLinejoin="round"
                                                        >
                                                            <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" />
                                                        </svg>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="icon-btn"
                                                        style={{ width: 28, height: 28 }}
                                                        title="Download portrait"
                                                        onClick={() => handleDownloadSingleImage(img)}
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
                                                            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
                                                        </svg>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="icon-btn"
                                                        style={{ width: 28, height: 28 }}
                                                        title="QR Code"
                                                        onClick={() => setQrModalImage(img)}
                                                    >
                                                        <QrCode size={15} />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="icon-btn"
                                                        style={{ width: 28, height: 28 }}
                                                        title="Portrait details"
                                                        onClick={() => setInspectImage(img)}
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
                                                            <circle cx="12" cy="12" r="9" />
                                                            <path d="M12 11v6M12 7.5v.5" />
                                                        </svg>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="icon-btn danger"
                                                        style={{ width: 28, height: 28 }}
                                                        title="Delete from Cloudinary"
                                                        aria-label="Delete portrait from Cloudinary"
                                                        onClick={() => setDeleteImageTargets([img])}
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {nextCursor && (
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                        marginTop: 22,
                                    }}
                                >
                                    <button
                                        type="button"
                                        className="btn"
                                        disabled={loadingMore}
                                        onClick={() => fetchImages(undefined, undefined, true)}
                                    >
                                        {loadingMore ? 'Loading…' : 'Load more portraits'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </section>
            )}

            {/* ======================== FEATURED TAB ======================== */}
            {activeTab === 'featured' && (
                <section>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 18,
                            flexWrap: 'wrap',
                            gap: 10,
                        }}
                    >
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>
                                Featured portraits · {featuredImages.length}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                These play on the event screen carousel. Click the star on any photo
                                to remove it.
                            </div>
                        </div>
                        {featuredImages.length > 0 && (
                            <button
                                type="button"
                                className="btn btn-pink"
                                onClick={() => handleBulkDownload(featuredImages)}
                            >
                                ⤓ Download all {featuredImages.length}
                            </button>
                        )}
                    </div>

                    {loadingFeatured ? (
                        <div
                            className="galgrid"
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                                gap: 20,
                            }}
                        >
                            {[1, 2, 3, 4].map(n => (
                                <div
                                    key={n}
                                    className="tile"
                                    style={{ background: '#E3DFD8' }}
                                />
                            ))}
                        </div>
                    ) : featuredImages.length === 0 ? (
                        <div
                            className="card"
                            style={{ padding: 48, textAlign: 'center' }}
                        >
                            <div style={{ fontWeight: 700, fontSize: 16 }}>
                                No featured portraits yet
                            </div>
                            <p
                                style={{
                                    color: 'var(--muted)',
                                    fontSize: 13,
                                    maxWidth: 380,
                                    margin: '6px auto 16px',
                                }}
                            >
                                Featured portraits play on the event screen carousel. Tap the ☆ on
                                any portrait in the Gallery to add it here.
                            </p>
                            <button
                                type="button"
                                className="btn btn-pink"
                                onClick={() => switchTab('gallery')}
                            >
                                Go to Gallery
                            </button>
                        </div>
                    ) : (
                        <>
                            <div
                                className="stagger galgrid"
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                                    gap: 20,
                                }}
                            >
                                {featuredImages.map(img => {
                                    const timeLabel = new Date(img.created_at).toLocaleString(
                                        undefined,
                                        {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        }
                                    );
                                    return (
                                        <div
                                            key={img.public_id}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 8,
                                                minWidth: 0,
                                            }}
                                        >
                                            <div
                                                className="tile"
                                                style={{
                                                    position: 'relative',
                                                    aspectRatio: '2 / 3',
                                                    borderRadius: 4,
                                                    background: '#E3DFD8',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                <img
                                                    src={getThumbImageUrl(img)}
                                                    alt={img.public_id}
                                                    loading="lazy"
                                                    style={{
                                                        position: 'absolute',
                                                        inset: 0,
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'cover',
                                                        display: 'block',
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    className="viewhit"
                                                    aria-label="Open full view"
                                                    onClick={() => setLightboxImage(img)}
                                                >
                                                    <span>
                                                        <svg
                                                            aria-hidden="true"
                                                            width="14"
                                                            height="14"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="2.2"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        >
                                                            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                                                        </svg>
                                                        Full view
                                                    </span>
                                                </button>
                                            </div>
                                            <div
                                                className="tilerow"
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: 4,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontSize: 12,
                                                        color: '#5C5C66',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        minWidth: 0,
                                                    }}
                                                >
                                                    {timeLabel}
                                                </span>
                                                <div style={{ display: 'flex', flex: 'none' }}>
                                                    <button
                                                        type="button"
                                                        className="icon-btn star-on"
                                                        style={{ width: 28, height: 28 }}
                                                        title="Remove from Featured"
                                                        disabled={taggingId === img.public_id}
                                                        onClick={() => handleToggleTag(img)}
                                                    >
                                                        <svg
                                                            aria-hidden="true"
                                                            width="16"
                                                            height="16"
                                                            viewBox="0 0 24 24"
                                                            fill="currentColor"
                                                            stroke="currentColor"
                                                            strokeWidth="2"
                                                            strokeLinejoin="round"
                                                        >
                                                            <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="icon-btn"
                                                        style={{ width: 28, height: 28 }}
                                                        title="Download portrait"
                                                        onClick={() => handleDownloadSingleImage(img)}
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
                                                            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="icon-btn"
                                                        style={{ width: 28, height: 28 }}
                                                        title="QR Code"
                                                        onClick={() => setQrModalImage(img)}
                                                    >
                                                        <QrCode size={15} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="icon-btn"
                                                        style={{ width: 28, height: 28 }}
                                                        title="Portrait details"
                                                        onClick={() => setInspectImage(img)}
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
                                                            <circle cx="12" cy="12" r="9" />
                                                            <path d="M12 11v6M12 7.5v.5" />
                                                        </svg>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="icon-btn danger"
                                                        style={{ width: 28, height: 28 }}
                                                        title="Delete from Cloudinary"
                                                        aria-label="Delete portrait from Cloudinary"
                                                        onClick={() => setDeleteImageTargets([img])}
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {featuredCursor && (
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                        marginTop: 22,
                                    }}
                                >
                                    <button
                                        type="button"
                                        className="btn"
                                        disabled={loadingMoreFeatured}
                                        onClick={() => fetchFeaturedImages(undefined, true)}
                                    >
                                        {loadingMoreFeatured
                                            ? 'Loading…'
                                            : 'Load more featured'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </section>
            )}

            {/* ======================== SETTINGS TAB (ADMIN) ======================== */}
            {isAdmin && activeTab === 'settings' && (
                <form
                    onSubmit={handleSaveProjectSettings}
                    style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1020 }}
                >
                    {/* Top Action Banner */}
                    <div
                        className="card"
                        style={{
                            padding: 24,
                            background: 'var(--void)',
                            color: '#fff',
                            borderColor: 'rgba(255,255,255,.08)',
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
                            <div>
                                <span className="lbl" style={{ color: 'var(--pink)' }}>
                                    Cloud &amp; Booth Configuration
                                </span>
                                <h3
                                    style={{
                                        fontWeight: 700,
                                        fontSize: 18,
                                        margin: '4px 0 0',
                                        color: '#fff',
                                    }}
                                >
                                    Project settings synced to the booth
                                </h3>
                            </div>

                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                    type="submit"
                                    className="btn btn-pink"
                                    disabled={isSavingSettings}
                                >
                                    {isSavingSettings ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <Save size={14} />
                                    )}
                                    {isSavingSettings ? 'Saving…' : 'Save all settings'}
                                </button>
                            </div>
                        </div>

                        {settingsError && (
                            <div
                                style={{
                                    marginTop: 14,
                                    padding: '10px 14px',
                                    borderRadius: 10,
                                    background: 'rgba(198,40,61,.2)',
                                    color: '#FCA5A5',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                }}
                            >
                                <AlertCircle size={15} /> {settingsError}
                            </div>
                        )}

                        {settingsSaveSuccess && (
                            <div
                                style={{
                                    marginTop: 14,
                                    padding: '10px 14px',
                                    borderRadius: 10,
                                    background: 'rgba(22,163,74,.2)',
                                    color: '#86EFAC',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                }}
                            >
                                <Check size={15} /> Project settings saved!
                            </div>
                        )}
                    </div>

                    {/* 1. Project details & Platform */}
                    <div className="card" style={{ padding: 28 }}>
                        <span className="lbl">Project details</span>
                        <h3 style={{ fontWeight: 700, fontSize: 18, margin: '4px 0 18px' }}>
                            Name, platform &amp; print counter
                        </h3>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: 14,
                                marginBottom: 18,
                            }}
                        >
                            <div>
                                <label className="lbl" style={{ display: 'block', marginBottom: 6 }}>
                                    Project name
                                </label>
                                <input
                                    className="field"
                                    required
                                    value={settingsForm.name}
                                    onChange={e =>
                                        setSettingsForm(prev => ({ ...prev, name: e.target.value }))
                                    }
                                />
                            </div>
                            <div>
                                <label className="lbl" style={{ display: 'block', marginBottom: 6 }}>
                                    Platform type
                                </label>
                                <div
                                    role="group"
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        gap: 4,
                                        padding: 4,
                                        border: '1px solid #E3DFD8',
                                        borderRadius: 4,
                                    }}
                                >
                                    <button
                                        type="button"
                                        style={{ flex: 1 }}
                                        className={`seg${settingsForm.projectType === 'desktop' ? ' on' : ''}`}
                                        onClick={() =>
                                            setSettingsForm(prev => ({
                                                ...prev,
                                                projectType: 'desktop',
                                            }))
                                        }
                                    >
                                        Desktop kiosk
                                    </button>
                                    <button
                                        type="button"
                                        style={{ flex: 1 }}
                                        className={`seg${settingsForm.projectType === 'web' ? ' on' : ''}`}
                                        onClick={() =>
                                            setSettingsForm(prev => ({
                                                ...prev,
                                                projectType: 'web',
                                            }))
                                        }
                                    >
                                        Web app
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div style={{ marginBottom: settingsForm.projectType === 'desktop' ? 18 : 0 }}>
                            <label className="lbl" style={{ display: 'block', marginBottom: 6 }}>
                                Description &amp; notes
                            </label>
                            <textarea
                                className="field"
                                rows={2}
                                value={settingsForm.description}
                                onChange={e =>
                                    setSettingsForm(prev => ({
                                        ...prev,
                                        description: e.target.value,
                                    }))
                                }
                            />
                        </div>

                        {settingsForm.projectType === 'desktop' && (
                            <div
                                style={{
                                    padding: 18,
                                    borderRadius: 12,
                                    background: 'var(--ground)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 16,
                                    flexWrap: 'wrap',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <Printer size={18} style={{ color: '#0B7A4B', flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                                            Printed copies counter
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                            Physical prints reported by the desktop booth via POST /print (printer hardware settings stay local on the booth)
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div>
                                        <span className="lbl" style={{ display: 'block' }}>
                                            Total printed copies
                                        </span>
                                        <input
                                            type="number"
                                            min={0}
                                            className="field"
                                            style={{ width: 120, padding: '6px 10px' }}
                                            value={settingsForm.totalPrintedCopies}
                                            onChange={e =>
                                                setSettingsForm(prev => ({
                                                    ...prev,
                                                    totalPrintedCopies: Math.max(
                                                        0,
                                                        parseInt(e.target.value) || 0
                                                    ),
                                                }))
                                            }
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        className="btn"
                                        disabled={isSimulatingPrint}
                                        onClick={handleSimulatePrintIncrement}
                                    >
                                        {isSimulatingPrint ? 'Testing…' : '+1 Test print'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 2. Booth setup, AI Model & API Key */}
                    <div className="card" style={{ padding: 28 }}>
                        <span className="lbl">Booth setup &amp; AI model</span>
                        <h3 style={{ fontWeight: 700, fontSize: 18, margin: '4px 0 18px' }}>
                            Portrait limit, image model &amp; API key
                        </h3>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                                gap: 14,
                                marginBottom: 16,
                            }}
                        >
                            <div>
                                <label className="lbl" style={{ display: 'block', marginBottom: 6 }}>
                                    Portrait limit
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    className="field"
                                    value={settingsForm.dailyLimit}
                                    onChange={e =>
                                        setSettingsForm(prev => ({
                                            ...prev,
                                            dailyLimit: Math.max(1, parseInt(e.target.value) || 0),
                                        }))
                                    }
                                />
                            </div>
                            <div>
                                <label className="lbl" style={{ display: 'block', marginBottom: 6 }}>
                                    Active AI model (controlled from dashboard)
                                </label>
                                <select
                                    className="field"
                                    value={settingsForm.aiModelId}
                                    onChange={e => {
                                        const chosenId = e.target.value;
                                        const chosen = aiModels.find(m => m.id === chosenId);
                                        setSettingsForm(prev => ({
                                            ...prev,
                                            aiModelId: chosenId,
                                            selectedAiModel: chosen?.name || prev.selectedAiModel,
                                        }));
                                    }}
                                >
                                    {aiModels.map(m => (
                                        <option key={m.id} value={m.id}>
                                            {m.name} ({m.provider === 'gemini' ? 'Gemini' : 'OpenAI'})
                                            {m.isDefault ? ' · Default' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="lbl" style={{ display: 'block', marginBottom: 6 }}>
                                    Reference images
                                </label>
                                <select
                                    className="field"
                                    value={settingsForm.referenceImagesCount}
                                    onChange={e =>
                                        setSettingsForm(prev => ({
                                            ...prev,
                                            referenceImagesCount: Math.max(
                                                1,
                                                Number(e.target.value) || 1
                                            ),
                                        }))
                                    }
                                >
                                    <option value={1}>1 · face</option>
                                    <option value={2}>2 · face + style</option>
                                    <option value={3}>2+ · face + style + bg</option>
                                </select>
                            </div>
                        </div>

                        <div
                            style={{
                                padding: 14,
                                borderRadius: 12,
                                background: 'var(--ground)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: 12,
                                marginBottom: 18,
                            }}
                        >
                            <div style={{ fontSize: 13 }}>
                                Price per portrait:{' '}
                                <b>${settingsCost.perPortrait.toFixed(3).replace(/0$/, '')}</b> · Spent
                                so far:{' '}
                                <b style={{ color: 'var(--pink)' }}>
                                    $
                                    {(
                                        project.currentGenerations * settingsCost.perPortrait
                                    ).toFixed(2)}
                                </b>{' '}
                                · At full limit:{' '}
                                <b>
                                    ${(settingsForm.dailyLimit * settingsCost.perPortrait).toFixed(2)}
                                </b>
                            </div>
                            <Link
                                href="/settings"
                                style={{
                                    fontSize: 12,
                                    color: 'var(--ink)',
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                }}
                            >
                                Manage image models in Settings →
                            </Link>
                        </div>

                        <div>
                            <label className="lbl" style={{ display: 'block', marginBottom: 6 }}>
                                {settingsCost.matched.provider === 'gemini'
                                    ? 'Google Gemini API Key (for selected model)'
                                    : 'OpenAI API Key (for selected model)'}
                            </label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showSecrets.aiApiKey ? 'text' : 'password'}
                                    className="field"
                                    style={{ fontFamily: 'monospace', paddingRight: 36 }}
                                    value={settingsForm.aiApiKey}
                                    onChange={e =>
                                        setSettingsForm(prev => ({
                                            ...prev,
                                            aiApiKey: e.target.value,
                                        }))
                                    }
                                    placeholder={
                                        settingsCost.matched.provider === 'gemini'
                                            ? 'AIza...'
                                            : 'sk-proj-...'
                                    }
                                />
                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowSecrets(p => ({ ...p, aiApiKey: !p.aiApiKey }))
                                    }
                                    style={{
                                        position: 'absolute',
                                        right: 10,
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none',
                                        border: 0,
                                        cursor: 'pointer',
                                        color: 'var(--muted)',
                                    }}
                                >
                                    {showSecrets.aiApiKey ? (
                                        <EyeOff size={14} />
                                    ) : (
                                        <Eye size={14} />
                                    )}
                                </button>
                            </div>
                            {settingsForm.aiApiKey.trim() &&
                                ((settingsCost.matched.provider === 'gemini' &&
                                    settingsForm.aiApiKey.trim().startsWith('sk-')) ||
                                    (settingsCost.matched.provider === 'openai' &&
                                        settingsForm.aiApiKey.trim().startsWith('AIza'))) && (
                                    <div
                                        style={{
                                            fontSize: 12,
                                            color: 'var(--pink)',
                                            marginTop: 6,
                                            fontWeight: 500,
                                        }}
                                    >
                                        Heads up: this key starts with{' '}
                                        <code>
                                            {settingsForm.aiApiKey.trim().startsWith('sk-')
                                                ? 'sk-'
                                                : 'AIza'}
                                        </code>
                                        , which may not match{' '}
                                        <b>
                                            {settingsCost.matched.provider === 'gemini'
                                                ? 'Google Gemini'
                                                : 'OpenAI'}
                                        </b>
                                        . Please update the API key when switching providers.
                                    </div>
                                )}
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                                Synced to the booth automatically as{' '}
                                <code>
                                    {settingsCost.matched.provider === 'gemini'
                                        ? 'geminiApiKey'
                                        : 'openaiApiKey'}
                                </code>{' '}
                                alongside locked model <code>{settingsCost.matched.name}</code>.
                            </div>
                        </div>
                    </div>

                    {/* 3. Storage & Connection (Cloudinary + APIs) */}
                    <div className="card" style={{ padding: 28 }}>
                        <span className="lbl">Storage &amp; connection</span>
                        <h3 style={{ fontWeight: 700, fontSize: 18, margin: '4px 0 18px' }}>
                            Cloudinary &amp; booth endpoints
                        </h3>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                                gap: 14,
                                marginBottom: 16,
                            }}
                        >
                            <div>
                                <label className="lbl" style={{ display: 'block', marginBottom: 6 }}>
                                    Cloudinary account
                                </label>
                                {cloudinaryAccounts.length > 0 ? (
                                    <select
                                        className="field"
                                        value={settingsForm.cloudinaryAccountId}
                                        onChange={e => {
                                            const nextId = e.target.value;
                                            const acc = cloudinaryAccounts.find(
                                                a => a.id === nextId
                                            );
                                            setSettingsForm(prev => ({
                                                ...prev,
                                                cloudinaryAccountId: nextId,
                                                cloudinaryCloudName:
                                                    acc?.cloudName || prev.cloudinaryCloudName,
                                                cloudinaryApiKey:
                                                    acc?.apiKey || prev.cloudinaryApiKey,
                                                cloudinaryApiSecret:
                                                    acc?.apiSecret || prev.cloudinaryApiSecret,
                                            }));
                                        }}
                                    >
                                        {cloudinaryAccounts.map(acc => (
                                            <option key={acc.id} value={acc.id}>
                                                {acc.label} ({acc.cloudName})
                                                {acc.isDefault ? ' · Default' : ''}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        className="field"
                                        readOnly
                                        value={
                                            settingsForm.cloudinaryCloudName
                                                ? `${settingsForm.cloudinaryCloudName} (add accounts in Global Settings)`
                                                : 'No Cloudinary accounts configured yet'
                                        }
                                    />
                                )}
                            </div>

                            <div>
                                <label className="lbl" style={{ display: 'block', marginBottom: 6 }}>
                                    Cloudinary folder / tag
                                </label>
                                <input
                                    className="field"
                                    value={settingsForm.cloudinaryFolder}
                                    onChange={e =>
                                        setSettingsForm(prev => ({
                                            ...prev,
                                            cloudinaryFolder: e.target.value,
                                        }))
                                    }
                                    placeholder="e.g. Egyptian-Museum-Photobooth"
                                />
                            </div>
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: 10,
                                padding: '10px 14px',
                                borderRadius: 4,
                                background: '#EEEBE5',
                                border: '1px solid #E3DFD8',
                                marginBottom: 16,
                                fontSize: 13,
                                color: '#5C5C66',
                            }}
                        >
                            <span>
                                Active cloud:{' '}
                                <code
                                    className="mono"
                                    style={{ color: '#050507', fontWeight: 600 }}
                                >
                                    {settingsForm.cloudinaryCloudName || '—'}
                                </code>
                            </span>
                            {user?.role === UserRole.ADMIN && (
                                <Link
                                    href="/settings"
                                    style={{
                                        color: '#FF0066',
                                        fontWeight: 600,
                                        textDecoration: 'none',
                                    }}
                                >
                                    Manage Cloudinary accounts in Settings →
                                </Link>
                            )}
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <label className="lbl" style={{ display: 'block', marginBottom: 6 }}>
                                Project ID
                            </label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input className="field" readOnly value={project.id} />
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => copyProjectId(project.id)}
                                >
                                    {copiedId ? '✓ Copied' : 'Copy ID'}
                                </button>
                            </div>
                        </div>

                        {/* Endpoints */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div>
                                <label className="lbl" style={{ display: 'block', marginBottom: 6 }}>
                                    Booth portrait counter URL (POST)
                                </label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <input
                                        className="field"
                                        style={{ flex: 1 }}
                                        readOnly
                                        value={`${origin}/api/projects/${project.id}/generate`}
                                    />
                                    <button
                                        type="button"
                                        className="btn"
                                        onClick={() =>
                                            copyToClipboard(
                                                `${origin}/api/projects/${project.id}/generate`
                                            )
                                        }
                                    >
                                        {copied ? '✓ Copied' : 'Copy URL'}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn"
                                        disabled={isSimulating}
                                        onClick={handleSimulateApiCall}
                                    >
                                        {isSimulating ? 'Sending…' : 'Send test'}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="lbl" style={{ display: 'block', marginBottom: 6 }}>
                                    Settings Sync URL (GET / POST / PUT)
                                </label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <input
                                        className="field"
                                        style={{ flex: 1 }}
                                        readOnly
                                        value={`${origin}/api/projects/${project.id}/settings`}
                                    />
                                    <button
                                        type="button"
                                        className="btn"
                                        onClick={() =>
                                            copySyncUrlToClipboard(
                                                `${origin}/api/projects/${project.id}/settings`
                                            )
                                        }
                                    >
                                        {copiedSyncUrl ? '✓ Copied' : 'Copy URL'}
                                    </button>
                                </div>
                            </div>

                            {settingsForm.projectType === 'desktop' && (
                                <div>
                                    <label
                                        className="lbl"
                                        style={{ display: 'block', marginBottom: 6 }}
                                    >
                                        Print Copies Tracking URL (POST)
                                    </label>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <input
                                            className="field"
                                            style={{ flex: 1 }}
                                            readOnly
                                            value={`${origin}/api/projects/${project.id}/print`}
                                        />
                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={() =>
                                                copyPrintUrlToClipboard(
                                                    `${origin}/api/projects/${project.id}/print`
                                                )
                                            }
                                        >
                                            {copiedPrintUrl ? '✓ Copied' : 'Copy URL'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Danger Zone */}
                    <div
                        className="card"
                        style={{ padding: 28, borderColor: '#E8C4C9' }}
                    >
                        <span className="lbl" style={{ color: '#C6283D' }}>
                            Danger zone
                        </span>
                        <h3 style={{ fontWeight: 700, fontSize: 18, margin: '4px 0 6px' }}>
                            Finish or delete this project
                        </h3>
                        <p
                            style={{
                                fontSize: 13,
                                color: 'var(--muted)',
                                margin: '0 0 16px',
                            }}
                        >
                            Finishing pauses new portrait generations while keeping the gallery.
                            Deleting removes the project and its logs forever.
                        </p>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="btn"
                                onClick={handleToggleProjectActive}
                            >
                                {project.status === 'paused'
                                    ? 'Reopen project'
                                    : 'Finish project'}
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() => {
                                    setDeleteConfirmText('');
                                    setDeleteStep(1);
                                }}
                            >
                                Delete project…
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {/* ======================== PHOTO DETAILS RIGHT PANEL ======================== */}
            {mounted &&
                inspectImage &&
                createPortal(
                    <div
                        className="fadein"
                        onClick={() => setInspectImage(null)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(13,13,18,.55)',
                            backdropFilter: 'blur(4px)',
                            zIndex: 60,
                            display: 'flex',
                            justifyContent: 'flex-end',
                        }}
                    >
                        <aside
                            className="slidein"
                            onClick={e => e.stopPropagation()}
                            style={{
                                width: 'min(480px, 100vw)',
                                height: '100%',
                                background: 'var(--pearl)',
                                borderLeft: '1px solid var(--hair)',
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    padding: '18px 22px',
                                    borderBottom: '1px solid var(--hair)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}
                            >
                                <div>
                                    <span className="lbl">Photo details</span>
                                    <div
                                        style={{
                                            fontWeight: 700,
                                            fontSize: 15,
                                            marginTop: 2,
                                        }}
                                    >
                                        {new Date(inspectImage.created_at).toLocaleString()}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                        type="button"
                                        className="icon-btn"
                                        title="Previous"
                                        disabled={inspectIndex <= 0}
                                        onClick={() => {
                                            if (inspectIndex > 0) {
                                                setInspectImage(
                                                    currentModalImageList[inspectIndex - 1]
                                                );
                                            }
                                        }}
                                    >
                                        ◀
                                    </button>
                                    <button
                                        type="button"
                                        className="icon-btn"
                                        title="Next"
                                        disabled={
                                            inspectIndex < 0 ||
                                            inspectIndex >= currentModalImageList.length - 1
                                        }
                                        onClick={() => {
                                            if (
                                                inspectIndex >= 0 &&
                                                inspectIndex < currentModalImageList.length - 1
                                            ) {
                                                setInspectImage(
                                                    currentModalImageList[inspectIndex + 1]
                                                );
                                            }
                                        }}
                                    >
                                        ▶
                                    </button>
                                    <button
                                        type="button"
                                        className="icon-btn"
                                        title="Close"
                                        onClick={() => setInspectImage(null)}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            <div
                                style={{
                                    padding: 22,
                                    overflowY: 'auto',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 18,
                                    flex: 1,
                                }}
                            >
                                <div
                                    onClick={() => setLightboxImage(inspectImage)}
                                    style={{
                                        flexShrink: 0,
                                        height: 340,
                                        aspectRatio:
                                            inspectImage.width && inspectImage.height
                                                ? `${inspectImage.width} / ${inspectImage.height}`
                                                : '2 / 3',
                                        maxWidth: '100%',
                                        margin: '0 auto',
                                        borderRadius: 14,
                                        overflow: 'hidden',
                                        border: '1px solid var(--hair)',
                                        position: 'relative',
                                        cursor: 'zoom-in',
                                        background: '#000',
                                    }}
                                >
                                    <img
                                        src={getFullImageUrl(inspectImage)}
                                        alt={inspectImage.public_id}
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'contain',
                                            display: 'block',
                                        }}
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                    <button
                                        type="button"
                                        className={`btn ${
                                            inspectImage.tags?.includes('Featured')
                                                ? ''
                                                : 'btn-pink'
                                        }`}
                                        style={{ flex: 1, justifyContent: 'center' }}
                                        onClick={() => handleToggleTag(inspectImage)}
                                    >
                                        ★{' '}
                                        {inspectImage.tags?.includes('Featured')
                                            ? 'Remove from Featured'
                                            : 'Add to Featured'}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn"
                                        style={{ flex: 1, justifyContent: 'center' }}
                                        onClick={() => handleDownloadSingleImage(inspectImage)}
                                    >
                                        ⤓ Download
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-danger"
                                        title="Delete from Cloudinary"
                                        aria-label="Delete portrait from Cloudinary"
                                        onClick={() => setDeleteImageTargets([inspectImage])}
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>

                                <div
                                    style={{
                                        flexShrink: 0,
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: 10,
                                        background: 'var(--ground)',
                                        padding: 14,
                                        borderRadius: 12,
                                    }}
                                >
                                    <div>
                                        <span className="lbl">Dimensions</span>
                                        <div
                                            style={{
                                                fontWeight: 600,
                                                fontSize: 13,
                                                marginTop: 2,
                                            }}
                                        >
                                            {inspectImage.width} × {inspectImage.height} (
                                            {inspectImage.format.toUpperCase()})
                                        </div>
                                    </div>
                                    <div>
                                        <span className="lbl">AI model</span>
                                        <div
                                            style={{
                                                fontWeight: 600,
                                                fontSize: 13,
                                                marginTop: 2,
                                            }}
                                        >
                                            {project.selectedAiModel || 'gpt-image-1.5'}
                                        </div>
                                    </div>
                                </div>

                                {processedDetails.length > 0 && (
                                    <div
                                        style={{
                                            flexShrink: 0,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 12,
                                        }}
                                    >
                                        {processedDetails.map((item, idx) => (
                                            <div key={idx}>
                                                <span
                                                    className="lbl"
                                                    style={{
                                                        display: 'block',
                                                        marginBottom: 6,
                                                    }}
                                                >
                                                    {item.label}
                                                </span>
                                                <div
                                                    style={{
                                                        padding: 12,
                                                        borderRadius: 10,
                                                        background: 'var(--ground)',
                                                        fontSize: 12,
                                                        lineHeight: 1.55,
                                                        whiteSpace: 'pre-wrap',
                                                        wordBreak: 'break-word',
                                                    }}
                                                >
                                                    {item.value}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </aside>
                    </div>,
                    document.body
                )}

            {/* ======================== FULL VIEW LIGHTBOX ======================== */}
            {mounted &&
                lightboxImage &&
                createPortal(
                    <div
                        className="fadein"
                        onClick={() => setLightboxImage(null)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(5,5,7,.94)',
                            backdropFilter: 'blur(8px)',
                            zIndex: 70,
                            display: 'flex',
                            flexDirection: 'column',
                            color: '#fff',
                        }}
                    >
                        <div
                            onClick={e => e.stopPropagation()}
                            style={{
                                padding: '16px 24px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderBottom: '1px solid rgba(255,255,255,.08)',
                                flexWrap: 'wrap',
                                gap: 12,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{ fontWeight: 700, fontSize: 14 }}>
                                    {new Date(lightboxImage.created_at).toLocaleString()}
                                </span>
                                <span style={{ color: 'rgba(255,255,255,.4)' }}>·</span>
                                <span style={{ fontSize: 12, color: 'rgba(255,255,255,.65)' }}>
                                    Portrait {lightboxIndex + 1} of {currentModalImageList.length} ·{' '}
                                    {lightboxImage.width} × {lightboxImage.height}{' '}
                                    {lightboxImage.format.toUpperCase()}
                                </span>
                            </div>

                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    type="button"
                                    className="lb-btn"
                                    onClick={() => handleToggleTag(lightboxImage)}
                                    style={{
                                        background: lightboxImage.tags?.includes('Featured')
                                            ? 'var(--pink)'
                                            : undefined,
                                        borderColor: lightboxImage.tags?.includes('Featured')
                                            ? 'var(--pink)'
                                            : undefined,
                                    }}
                                >
                                    ★{' '}
                                    {lightboxImage.tags?.includes('Featured')
                                        ? 'Featured'
                                        : 'Feature'}
                                </button>
                                <button
                                    type="button"
                                    className="lb-btn"
                                    onClick={() => handleDownloadSingleImage(lightboxImage)}
                                >
                                    ⤓ Download
                                </button>
                                <button
                                    type="button"
                                    className="lb-btn"
                                    onClick={() => {
                                        const target = lightboxImage;
                                        setLightboxImage(null);
                                        setInspectImage(target);
                                    }}
                                >
                                    ⓘ Details
                                </button>
                                <button
                                    type="button"
                                    className="lb-btn"
                                    title="Delete from Cloudinary"
                                    onClick={() => setDeleteImageTargets([lightboxImage])}
                                    style={{
                                        borderColor: 'rgba(255,77,109,.45)',
                                        color: '#FF7088',
                                    }}
                                >
                                    <Trash2 size={14} /> Delete
                                </button>
                                <button
                                    type="button"
                                    className="lb-btn"
                                    onClick={() => setLightboxImage(null)}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        <div
                            style={{
                                flex: 1,
                                display: 'grid',
                                gridTemplateColumns: '64px 1fr 64px',
                                alignItems: 'center',
                                padding: '20px 12px',
                                minHeight: 0,
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                {lightboxIndex > 0 && (
                                    <button
                                        type="button"
                                        className="lb-btn"
                                        onClick={e => {
                                            e.stopPropagation();
                                            setLightboxImage(
                                                currentModalImageList[lightboxIndex - 1]
                                            );
                                        }}
                                    >
                                        ◀
                                    </button>
                                )}
                            </div>

                            <div
                                onClick={e => e.stopPropagation()}
                                style={{
                                    height: '100%',
                                    display: 'grid',
                                    placeItems: 'center',
                                    minHeight: 0,
                                }}
                            >
                                <img
                                    src={getFullImageUrl(lightboxImage)}
                                    alt={lightboxImage.public_id}
                                    className="zoomin"
                                    style={{
                                        maxHeight: 'calc(100vh - 130px)',
                                        maxWidth: '100%',
                                        objectFit: 'contain',
                                        borderRadius: 14,
                                        boxShadow: '0 30px 90px rgba(0,0,0,.6)',
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                {lightboxIndex >= 0 &&
                                    lightboxIndex < currentModalImageList.length - 1 && (
                                        <button
                                            type="button"
                                            className="lb-btn"
                                            onClick={e => {
                                                e.stopPropagation();
                                                setLightboxImage(
                                                    currentModalImageList[lightboxIndex + 1]
                                                );
                                            }}
                                        >
                                            ▶
                                        </button>
                                    )}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

            {/* ======================== QR CODE MODAL ======================== */}
            {mounted &&
                qrModalImage &&
                createPortal(
                    <div
                        className="fadein"
                        onClick={() => setQrModalImage(null)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(13,13,18,.6)',
                            backdropFilter: 'blur(4px)',
                            zIndex: 80,
                            display: 'grid',
                            placeItems: 'center',
                            padding: 20,
                        }}
                    >
                        <div
                            className="card zoomin"
                            onClick={e => e.stopPropagation()}
                            style={{
                                width: 'min(380px, 100%)',
                                padding: 26,
                                textAlign: 'center',
                            }}
                        >
                            <span className="lbl" style={{ color: 'var(--pink)' }}>
                                Guest share link
                            </span>
                            <h3 style={{ fontWeight: 800, fontSize: 18, margin: '4px 0 16px' }}>
                                Scan to download portrait
                            </h3>
                            <div
                                style={{
                                    background: '#fff',
                                    padding: 16,
                                    borderRadius: 14,
                                    border: '1px solid var(--hair)',
                                    display: 'inline-block',
                                }}
                            >
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(
                                        getFullImageUrl(qrModalImage)
                                    )}`}
                                    alt="QR Code"
                                    width={220}
                                    height={220}
                                />
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 8,
                                    justifyContent: 'center',
                                    marginTop: 18,
                                }}
                            >
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => setQrModalImage(null)}
                                >
                                    Close
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-pink"
                                    onClick={() => handleDownloadSingleImage(qrModalImage)}
                                >
                                    ⤓ Download image
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

            {/* ======================== 2-STEP DELETE PROJECT DIALOG ======================== */}
            {mounted &&
                deleteStep > 0 &&
                createPortal(
                    <div
                        className="fadein"
                        onClick={() => setDeleteStep(0)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(13,13,18,.6)',
                            backdropFilter: 'blur(4px)',
                            zIndex: 85,
                            display: 'grid',
                            placeItems: 'center',
                            padding: 20,
                        }}
                    >
                        <div
                            className="card zoomin"
                            onClick={e => e.stopPropagation()}
                            style={{ width: 'min(440px, 100%)', padding: 26 }}
                        >
                            <span className="lbl" style={{ color: '#C6283D' }}>
                                Delete project · Step {deleteStep} of 2
                            </span>
                            {deleteStep === 1 ? (
                                <>
                                    <h3
                                        style={{
                                            fontWeight: 800,
                                            fontSize: 20,
                                            margin: '6px 0 8px',
                                        }}
                                    >
                                        Delete {project.name}?
                                    </h3>
                                    <p
                                        style={{
                                            fontSize: 13,
                                            color: 'var(--muted)',
                                            lineHeight: 1.55,
                                            margin: '0 0 20px',
                                        }}
                                    >
                                        This removes the project, its usage counters, and team
                                        assignments from the dashboard.
                                    </p>
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'flex-end',
                                            gap: 8,
                                        }}
                                    >
                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={() => setDeleteStep(0)}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-danger"
                                            onClick={() => setDeleteStep(2)}
                                        >
                                            Continue →
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h3
                                        style={{
                                            fontWeight: 800,
                                            fontSize: 20,
                                            margin: '6px 0 8px',
                                        }}
                                    >
                                        Type project name to confirm
                                    </h3>
                                    <p
                                        style={{
                                            fontSize: 13,
                                            color: 'var(--muted)',
                                            lineHeight: 1.55,
                                            margin: '0 0 12px',
                                        }}
                                    >
                                        Type <b style={{ color: 'var(--ink)' }}>{project.name}</b>{' '}
                                        below to permanently delete this project.
                                    </p>
                                    <input
                                        className="field"
                                        placeholder={project.name}
                                        value={deleteConfirmText}
                                        onChange={e => setDeleteConfirmText(e.target.value)}
                                        style={{ marginBottom: 18 }}
                                    />
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'flex-end',
                                            gap: 8,
                                        }}
                                    >
                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={() => setDeleteStep(0)}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-danger"
                                            disabled={
                                                deleteConfirmText.trim() !== project.name.trim() ||
                                                isDeleting
                                            }
                                            onClick={handleDeleteProject}
                                        >
                                            {isDeleting ? 'Deleting…' : 'Delete forever'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>,
                    document.body
                )}

            {/* ======================== DELETE PORTRAIT(S) DIALOG ======================== */}
            {mounted &&
                deleteImageTargets.length > 0 &&
                createPortal(
                    <div
                        className="fadein"
                        onClick={() => !isDeletingImages && setDeleteImageTargets([])}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(13,13,18,.6)',
                            backdropFilter: 'blur(4px)',
                            zIndex: 88,
                            display: 'grid',
                            placeItems: 'center',
                            padding: 20,
                        }}
                    >
                        <div
                            className="card zoomin"
                            onClick={e => e.stopPropagation()}
                            style={{ width: 'min(420px, 100%)', padding: 26, gap: 14 }}
                        >
                            <span className="lbl" style={{ color: '#C6283D' }}>
                                Cloudinary · Permanent deletion
                            </span>
                            <h3 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>
                                {deleteImageTargets.length === 1
                                    ? 'Delete this portrait?'
                                    : `Delete ${deleteImageTargets.length} portraits?`}
                            </h3>

                            {deleteImageTargets.length === 1 && (
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        padding: 10,
                                        borderRadius: 4,
                                        background: '#EEEBE5',
                                        border: '1px solid #E3DFD8',
                                    }}
                                >
                                    <img
                                        src={getThumbImageUrl(deleteImageTargets[0])}
                                        alt={deleteImageTargets[0].public_id}
                                        style={{
                                            width: 48,
                                            height: 72,
                                            objectFit: 'cover',
                                            borderRadius: 4,
                                            flex: 'none',
                                        }}
                                    />
                                    <div style={{ minWidth: 0 }}>
                                        <div
                                            style={{
                                                fontWeight: 700,
                                                fontSize: 13,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {new Date(
                                                deleteImageTargets[0].created_at
                                            ).toLocaleString()}
                                        </div>
                                        <div
                                            className="mono"
                                            style={{
                                                fontSize: 11,
                                                color: '#5C5C66',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                marginTop: 2,
                                            }}
                                        >
                                            {deleteImageTargets[0].public_id}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <p
                                style={{
                                    fontSize: 13,
                                    color: '#5C5C66',
                                    lineHeight: 1.55,
                                    margin: 0,
                                }}
                            >
                                {deleteImageTargets.length === 1
                                    ? 'This permanently deletes the image from Cloudinary and invalidates its CDN link. This action cannot be undone.'
                                    : `This permanently deletes all ${deleteImageTargets.length} selected images from Cloudinary and invalidates their CDN links. This action cannot be undone.`}
                            </p>

                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'flex-end',
                                    gap: 8,
                                    marginTop: 4,
                                }}
                            >
                                <button
                                    type="button"
                                    className="btn"
                                    disabled={isDeletingImages}
                                    onClick={() => setDeleteImageTargets([])}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-danger"
                                    disabled={isDeletingImages}
                                    onClick={handleConfirmDeleteImages}
                                >
                                    <Trash2 size={14} />
                                    {isDeletingImages
                                        ? 'Deleting…'
                                        : deleteImageTargets.length === 1
                                          ? 'Delete portrait'
                                          : `Delete ${deleteImageTargets.length} portraits`}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

            {/* ======================== TOAST ======================== */}
            {mounted &&
                toastState &&
                createPortal(
                    <div
                        className="toastin"
                        style={{
                            position: 'fixed',
                            bottom: 24,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'var(--void)',
                            color: '#fff',
                            padding: '10px 16px',
                            borderRadius: 99,
                            fontSize: 13,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            boxShadow: '0 18px 40px rgba(0,0,0,.35)',
                            zIndex: 90,
                        }}
                    >
                        <span>{toastState.message}</span>
                        {toastState.img && (
                            <button
                                type="button"
                                onClick={() => {
                                    const target = toastState.img;
                                    if (!target) return;
                                    setToastState(null);
                                    handleToggleTag(target, false);
                                }}
                                style={{
                                    background: 'transparent',
                                    border: 0,
                                    color: 'var(--pink)',
                                    fontWeight: 800,
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    letterSpacing: '.06em',
                                    textTransform: 'uppercase',
                                }}
                            >
                                UNDO
                            </button>
                        )}
                    </div>,
                    document.body
                )}
        </>
    );
}
