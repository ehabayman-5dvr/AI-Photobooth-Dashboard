import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { AiProvider, DEFAULT_AI_MODEL_CATALOG } from '@/types';
import {
    getServerSupabaseClient,
    resolveCloudinaryCredentials,
    ResolvedCloudinaryCredentials,
} from '@/utils/cloudinaryServer';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

interface ResolvedAiModel {
    id: string | null;
    name: string;
    provider: AiProvider;
}

async function resolveProjectAiModel(
    supabase: SupabaseClient,
    projectRow: any,
    explicitModelId?: string | null
): Promise<ResolvedAiModel> {
    const targetId = explicitModelId || projectRow?.ai_model_id || null;

    try {
        if (targetId) {
            const { data: m, error } = await supabase
                .from('ai_models')
                .select('id, name, provider')
                .eq('id', targetId)
                .single();

            if (!error && m && m.name) {
                return {
                    id: m.id,
                    name: m.name,
                    provider: m.provider === 'gemini' ? 'gemini' : 'openai',
                };
            }
        }

        const { data: list, error: listErr } = await supabase
            .from('ai_models')
            .select('id, name, provider, is_default')
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: true });

        if (!listErr && Array.isArray(list) && list.length > 0) {
            const matched = list.find(item => item.is_default) || list[0];

            if (matched && matched.name) {
                return {
                    id: matched.id,
                    name: matched.name,
                    provider: matched.provider === 'gemini' ? 'gemini' : 'openai',
                };
            }
        }
    } catch {
        // Fallback to default catalog constant if lookup fails
    }

    const fallback = DEFAULT_AI_MODEL_CATALOG[0];
    return {
        id: null,
        name: fallback.name,
        provider: fallback.provider,
    };
}

function buildCloudSettingsPayload(
    project: any,
    creds: ResolvedCloudinaryCredentials,
    aiModel: ResolvedAiModel,
    aiApiKey: string
) {
    const folder = project.cloudinary_folder || project.cloudinary_tag || '';

    // Return strictly cloud/backend project settings — local booth hardware/UI settings
    // (printer, camera, timers, kiosk lock, image quality, viewer URL) stay 100% local on the booth.
    return {
        dashboardProjectId: project.id,
        projectName: project.name,
        isActive: project.is_active !== false,
        dailyLimit: project.max_usage || 1000,
        currentGenerations: project.total_usage || 0,
        projectType: project.project_type || 'desktop',
        cloudinaryAccountId: creds.accountId,
        cloudinaryAccountLabel: creds.accountLabel,
        cloudinaryCloudName: creds.cloudName,
        cloudinaryApiKey: creds.apiKey,
        cloudinaryApiSecret: creds.apiSecret,
        cloudinaryFolder: folder,
        aiModelId: aiModel.id,
        aiModelProvider: aiModel.provider,
        openaiModel: aiModel.name,
        aiModelsList: [aiModel.name],
        openaiApiKey: aiModel.provider === 'openai' ? aiApiKey : '',
        geminiApiKey: aiModel.provider === 'gemini' ? aiApiKey : '',
        referenceImagesCount: Math.max(1, Number(project.reference_images_count) || 1),
        totalPrintedCopies: project.total_printed_copies || 0,
    };
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const supabase = getServerSupabaseClient();

        const { data: project, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !project) {
            return NextResponse.json(
                { error: error?.message || 'Project not found' },
                { status: 404, headers: corsHeaders }
            );
        }

        const [creds, aiModel] = await Promise.all([
            resolveCloudinaryCredentials({
                supabase,
                projectId: id,
                projectRow: project,
            }),
            resolveProjectAiModel(supabase, project),
        ]);

        const resolvedApiKey = (project.ai_api_key || '').trim();
        const settingsPayload = buildCloudSettingsPayload(
            project,
            creds,
            aiModel,
            resolvedApiKey
        );

        return NextResponse.json(settingsPayload, {
            status: 200,
            headers: corsHeaders,
        });
    } catch (error: any) {
        console.error('GET /api/projects/[id]/settings error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch project settings' },
            { status: 500, headers: corsHeaders }
        );
    }
}

async function handleUpsertSettings(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const body = await request.json();
        const supabase = getServerSupabaseClient();

        const { data: existing, error: fetchError } = await supabase
            .from('projects')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !existing) {
            return NextResponse.json(
                { error: fetchError?.message || 'Project not found' },
                { status: 404, headers: corsHeaders }
            );
        }

        const requestedAccountId =
            body.cloudinaryAccountId !== undefined
                ? body.cloudinaryAccountId || null
                : existing.cloudinary_account_id || null;

        // Only Dashboard requests passing aiModelId can switch the project's AI model
        const requestedModelId =
            body.aiModelId !== undefined
                ? body.aiModelId || null
                : existing.ai_model_id || null;

        const [resolvedCreds, resolvedAiModel] = await Promise.all([
            resolveCloudinaryCredentials({
                supabase,
                accountId: requestedAccountId,
                projectRow: existing,
            }),
            resolveProjectAiModel(supabase, existing, requestedModelId),
        ]);

        const updatedAiApiKey =
            typeof body.aiApiKey === 'string'
                ? body.aiApiKey.trim()
                : (existing.ai_api_key ?? '').trim();

        const updatedFolder =
            body.cloudinaryFolder ??
            body.cloudinaryTag ??
            existing.cloudinary_folder ??
            existing.cloudinary_tag ??
            '';

        const updatedProjectType =
            body.projectType === 'web' || body.projectType === 'desktop'
                ? body.projectType
                : existing.project_type || 'desktop';

        const updatePayload: Record<string, any> = {
            project_type: updatedProjectType,
            cloudinary_account_id:
                body.cloudinaryAccountId !== undefined
                    ? body.cloudinaryAccountId || resolvedCreds.accountId
                    : existing.cloudinary_account_id || resolvedCreds.accountId,
            cloudinary_folder: updatedFolder,
            cloudinary_tag: updatedFolder || existing.cloudinary_tag,
            ai_model_id: resolvedAiModel.id,
            ai_api_key: updatedAiApiKey,
            updated_at: new Date().toISOString(),
        };

        if (typeof body.totalPrintedCopies === 'number') {
            updatePayload.total_printed_copies = Math.max(0, Math.floor(body.totalPrintedCopies));
        }
        if (typeof body.name === 'string' && body.name.trim()) {
            updatePayload.name = body.name.trim();
        }
        if (typeof body.description === 'string') {
            updatePayload.description = body.description;
        }
        if (typeof body.dailyLimit === 'number') {
            updatePayload.max_usage = body.dailyLimit;
        }
        if (typeof body.isActive === 'boolean') {
            updatePayload.is_active = body.isActive;
        }
        if (typeof body.referenceImagesCount === 'number') {
            updatePayload.reference_images_count = Math.max(
                1,
                Math.round(body.referenceImagesCount)
            );
        }

        const { data: updatedProject, error: updateError } = await supabase
            .from('projects')
            .update(updatePayload)
            .eq('id', id)
            .select('*')
            .single();

        if (updateError) {
            throw updateError;
        }

        const [finalCreds, finalAiModel] = await Promise.all([
            resolveCloudinaryCredentials({
                supabase,
                projectId: id,
                projectRow: updatedProject,
            }),
            resolveProjectAiModel(supabase, updatedProject),
        ]);

        const finalApiKey = (updatedProject.ai_api_key ?? updatedAiApiKey).trim();
        const fullResponse = buildCloudSettingsPayload(
            updatedProject,
            finalCreds,
            finalAiModel,
            finalApiKey
        );

        return NextResponse.json(
            {
                success: true,
                projectId: id,
                settings: fullResponse,
                updatedAt: updatedProject.updated_at,
            },
            { status: 200, headers: corsHeaders }
        );
    } catch (error: any) {
        console.error('POST/PUT /api/projects/[id]/settings error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to sync project settings' },
            { status: 500, headers: corsHeaders }
        );
    }
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleUpsertSettings(request, context);
}

export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleUpsertSettings(request, context);
}
