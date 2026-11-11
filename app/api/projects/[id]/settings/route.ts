import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_AI_MODELS, DEFAULT_OPERATOR_SETTINGS, ProjectOperatorSettings } from '@/types';

const getAdminClient = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
        throw new Error('Supabase credentials missing');
    }

    return createClient(url, key);
};

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

function buildFullSettingsPayload(project: any, globalSettings?: any) {
    const op: ProjectOperatorSettings = project.operator_settings || {};

    const cloudName =
        project.cloudinary_cloud_name ||
        op.cloudinaryCloudName ||
        globalSettings?.cloudinary_cloud_name ||
        '';
    const apiKey =
        project.cloudinary_api_key ||
        op.cloudinaryApiKey ||
        globalSettings?.cloudinary_api_key ||
        '';
    const apiSecret =
        project.cloudinary_api_secret ||
        op.cloudinaryApiSecret ||
        globalSettings?.cloudinary_api_secret ||
        '';
    const folder =
        project.cloudinary_folder ||
        project.cloudinary_tag ||
        op.cloudinaryFolder ||
        '';

    const aiModelsList: string[] = Array.isArray(project.ai_models_list) && project.ai_models_list.length > 0
        ? project.ai_models_list
        : Array.isArray(op.aiModelsList) && op.aiModelsList.length > 0
            ? op.aiModelsList
            : [...DEFAULT_AI_MODELS];

    const selectedModel =
        project.selected_ai_model ||
        op.openaiModel ||
        aiModelsList[0] ||
        DEFAULT_OPERATOR_SETTINGS.openaiModel;

    const enablePrinting =
        typeof project.enable_printing === 'boolean'
            ? project.enable_printing
            : typeof op.enablePrinting === 'boolean'
                ? op.enablePrinting
                : DEFAULT_OPERATOR_SETTINGS.enablePrinting;

    const mergedSettings = {
        ...DEFAULT_OPERATOR_SETTINGS,
        ...op,
        cloudinaryCloudName: cloudName,
        cloudinaryApiKey: apiKey,
        cloudinaryApiSecret: apiSecret,
        cloudinaryFolder: folder,
        dashboardProjectId: project.id,
        openaiModel: selectedModel,
        aiModelsList,
        enablePrinting,
        projectType: project.project_type || 'desktop',
        totalPrintedCopies: project.total_printed_copies || 0,
    };

    return mergedSettings;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const supabase = getAdminClient();

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

        const { data: globalSettings } = await supabase
            .from('global_settings')
            .select('*')
            .eq('id', 'current')
            .single();

        const settingsPayload = buildFullSettingsPayload(project, globalSettings);

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
        const supabase = getAdminClient();

        // Fetch existing project to merge operator_settings cleanly
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

        const existingOp: ProjectOperatorSettings = existing.operator_settings || {};
        const incomingOp: ProjectOperatorSettings = body.operatorSettings || body;

        const updatedCloudName =
            body.cloudinaryCloudName ??
            incomingOp.cloudinaryCloudName ??
            existing.cloudinary_cloud_name ??
            '';
        const updatedApiKey =
            body.cloudinaryApiKey ??
            incomingOp.cloudinaryApiKey ??
            existing.cloudinary_api_key ??
            '';
        const updatedApiSecret =
            body.cloudinaryApiSecret ??
            incomingOp.cloudinaryApiSecret ??
            existing.cloudinary_api_secret ??
            '';
        const updatedFolder =
            body.cloudinaryFolder ??
            body.cloudinaryTag ??
            incomingOp.cloudinaryFolder ??
            existing.cloudinary_folder ??
            existing.cloudinary_tag ??
            '';

        const updatedModelsList =
            Array.isArray(body.aiModelsList)
                ? body.aiModelsList
                : Array.isArray(incomingOp.aiModelsList)
                    ? incomingOp.aiModelsList
                    : existing.ai_models_list || [...DEFAULT_AI_MODELS];

        const updatedSelectedModel =
            body.selectedAiModel ??
            body.openaiModel ??
            incomingOp.openaiModel ??
            existing.selected_ai_model ??
            DEFAULT_OPERATOR_SETTINGS.openaiModel;

        const updatedEnablePrinting =
            typeof body.enablePrinting === 'boolean'
                ? body.enablePrinting
                : typeof incomingOp.enablePrinting === 'boolean'
                    ? incomingOp.enablePrinting
                    : typeof existing.enable_printing === 'boolean'
                        ? existing.enable_printing
                        : true;

        const updatedProjectType =
            body.projectType === 'web' || body.projectType === 'desktop'
                ? body.projectType
                : existing.project_type || 'desktop';

        const mergedOp: ProjectOperatorSettings = {
            ...DEFAULT_OPERATOR_SETTINGS,
            ...existingOp,
            ...incomingOp,
            cloudinaryCloudName: updatedCloudName,
            cloudinaryApiKey: updatedApiKey,
            cloudinaryApiSecret: updatedApiSecret,
            cloudinaryFolder: updatedFolder,
            dashboardProjectId: id,
            openaiModel: updatedSelectedModel,
            aiModelsList: updatedModelsList,
            enablePrinting: updatedEnablePrinting,
        };

        const updatePayload: Record<string, any> = {
            project_type: updatedProjectType,
            cloudinary_cloud_name: updatedCloudName,
            cloudinary_api_key: updatedApiKey,
            cloudinary_api_secret: updatedApiSecret,
            cloudinary_folder: updatedFolder,
            cloudinary_tag: updatedFolder || existing.cloudinary_tag,
            ai_models_list: updatedModelsList,
            selected_ai_model: updatedSelectedModel,
            enable_printing: updatedEnablePrinting,
            operator_settings: mergedOp,
            updated_at: new Date().toISOString(),
        };

        if (typeof body.totalPrintedCopies === 'number') {
            updatePayload.total_printed_copies = body.totalPrintedCopies;
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
            updatePayload.reference_images_count = body.referenceImagesCount;
        }

        let { data: updatedProject, error: updateError } = await supabase
            .from('projects')
            .update(updatePayload)
            .eq('id', id)
            .select('*')
            .single();

        if (updateError && updateError.code === 'PGRST204' && updatePayload.reference_images_count !== undefined) {
            delete updatePayload.reference_images_count;
            const retry = await supabase
                .from('projects')
                .update(updatePayload)
                .eq('id', id)
                .select('*')
                .single();
            updatedProject = retry.data;
            updateError = retry.error;
        }

        if (updateError) {
            if (updateError.code === 'PGRST204') {
                return NextResponse.json(
                    {
                        success: false,
                        code: 'PGRST204',
                        error: "Database migration required: Please run supabase/migrations/20261109153000_add_project_operator_settings.sql in your Supabase SQL Editor.",
                    },
                    { status: 500, headers: corsHeaders }
                );
            }
            throw updateError;
        }

        const { data: globalSettings } = await supabase
            .from('global_settings')
            .select('*')
            .eq('id', 'current')
            .single();

        const fullResponse = buildFullSettingsPayload(updatedProject, globalSettings);

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

