
import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { createClient } from '@supabase/supabase-js';

// Internal server-side only client to bypass RLS if needed, or use service role
// But for now, we'll use the anon key as we enabled public read for settings
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    let cloudName = searchParams.get('cloudName');
    let apiKey = searchParams.get('apiKey');
    let apiSecret = searchParams.get('apiSecret');
    const tag = searchParams.get('tag');
    const subtag = searchParams.get('subtag');
    const nextCursor = searchParams.get('next_cursor');
    const sort = searchParams.get('sort') || 'desc';

    // 1. Check project-specific credentials first if projectId is provided
    if (projectId && (!cloudName || !apiKey || !apiSecret)) {
        try {
            const { data: proj } = await supabase
                .from('projects')
                .select('cloudinary_cloud_name, cloudinary_api_key, cloudinary_api_secret, operator_settings')
                .eq('id', projectId)
                .single();

            if (proj) {
                const op = proj.operator_settings || {};
                cloudName = cloudName || proj.cloudinary_cloud_name || op.cloudinaryCloudName;
                apiKey = apiKey || proj.cloudinary_api_key || op.cloudinaryApiKey;
                apiSecret = apiSecret || proj.cloudinary_api_secret || op.cloudinaryApiSecret;
            }
        } catch (err) {
            console.error('Failed to fetch project Cloudinary settings:', err);
        }
    }

    // 2. If credentials still not resolved, try fetching from Supabase global_settings
    if (!cloudName || !apiKey || !apiSecret) {
        try {
            const { data: settings } = await supabase
                .from('global_settings')
                .select('*')
                .eq('id', 'current')
                .single();

            if (settings) {
                cloudName = cloudName || settings.cloudinary_cloud_name;
                apiKey = apiKey || settings.cloudinary_api_key;
                apiSecret = apiSecret || settings.cloudinary_api_secret;
            }
        } catch (err) {
            console.error('Failed to fetch fallback settings from Supabase:', err);
        }
    }

    if (!cloudName || !apiKey || !apiSecret || !tag) {
        return NextResponse.json({ error: 'Missing Cloudinary configuration' }, { status: 400 });
    }

    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true
    });

    try {
        let expression = `(tags:"${tag}" OR folder:"${tag}/*") AND NOT folder:"${tag}/qr-codes/*"`;
        if (subtag) {
            expression = `(${expression}) AND tags:"${subtag}"`;
        }

        const result = await cloudinary.search
            .expression(expression)
            .sort_by('created_at', sort as 'asc' | 'desc')
            .max_results(24)
            .with_field('context')
            .with_field('metadata')
            .with_field('tags')
            .next_cursor(nextCursor || undefined)
            .execute();

        return NextResponse.json({
            resources: result.resources,
            next_cursor: result.next_cursor
        });
    } catch (error: any) {
        console.error('Cloudinary API Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to fetch images' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            public_id,
            public_ids,
            projectId,
            cloudName: reqCloudName,
            apiKey: reqApiKey,
            apiSecret: reqApiSecret,
        } = body;

        const idsToDelete: string[] = Array.isArray(public_ids)
            ? public_ids.filter(Boolean)
            : public_id
              ? [public_id]
              : [];

        if (idsToDelete.length === 0) {
            return NextResponse.json({ error: 'Missing public_id to delete' }, { status: 400 });
        }

        let cloudName = reqCloudName;
        let apiKey = reqApiKey;
        let apiSecret = reqApiSecret;

        // 1. Resolve project-specific credentials first if projectId is provided
        if (projectId && (!cloudName || !apiKey || !apiSecret)) {
            const { data: proj } = await supabase
                .from('projects')
                .select('cloudinary_cloud_name, cloudinary_api_key, cloudinary_api_secret, operator_settings')
                .eq('id', projectId)
                .single();

            if (proj) {
                const op = proj.operator_settings || {};
                cloudName = cloudName || proj.cloudinary_cloud_name || op.cloudinaryCloudName;
                apiKey = apiKey || proj.cloudinary_api_key || op.cloudinaryApiKey;
                apiSecret = apiSecret || proj.cloudinary_api_secret || op.cloudinaryApiSecret;
            }
        }

        // 2. Fallback to Supabase global_settings
        if (!cloudName || !apiKey || !apiSecret) {
            const { data: settings } = await supabase
                .from('global_settings')
                .select('*')
                .eq('id', 'current')
                .single();

            if (settings) {
                cloudName = cloudName || settings.cloudinary_cloud_name;
                apiKey = apiKey || settings.cloudinary_api_key;
                apiSecret = apiSecret || settings.cloudinary_api_secret;
            }
        }

        if (!cloudName || !apiKey || !apiSecret) {
            return NextResponse.json({ error: 'Missing Cloudinary configuration' }, { status: 400 });
        }

        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
            secure: true,
        });

        let result;
        if (idsToDelete.length === 1) {
            result = await cloudinary.uploader.destroy(idsToDelete[0], { invalidate: true });
        } else {
            result = await cloudinary.api.delete_resources(idsToDelete, { invalidate: true });
        }

        return NextResponse.json({ success: true, deleted: idsToDelete, result });
    } catch (error: any) {
        console.error('Cloudinary Delete API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to delete image from Cloudinary' },
            { status: 500 }
        );
    }
}
