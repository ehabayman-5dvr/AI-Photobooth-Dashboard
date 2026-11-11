
import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { public_id, tag, action, projectId, cloudName: reqCloudName, apiKey: reqApiKey, apiSecret: reqApiSecret } = body;

        if (!public_id || !tag || !action) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        let cloudName = reqCloudName;
        let apiKey = reqApiKey;
        let apiSecret = reqApiSecret;

        // 1. Check project-specific credentials first if projectId is provided
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

        // 2. If credentials still not resolved, try fetching from Supabase global_settings
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
            secure: true
        });

        let result;
        if (action === 'add') {
            result = await cloudinary.uploader.add_tag(tag, [public_id]);
        } else if (action === 'remove') {
            result = await cloudinary.uploader.remove_tag(tag, [public_id]);
        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        return NextResponse.json({ success: true, result });
    } catch (error: any) {
        console.error('Cloudinary Tag API Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to update tag' }, { status: 500 });
    }
}
