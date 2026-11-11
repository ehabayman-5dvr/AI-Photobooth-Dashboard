import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { resolveCloudinaryCredentials } from '@/utils/cloudinaryServer';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            public_id,
            tag,
            action,
            projectId,
            accountId,
            cloudName: reqCloudName,
            apiKey: reqApiKey,
            apiSecret: reqApiSecret,
        } = body;

        if (!public_id || !tag || !action) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const creds = await resolveCloudinaryCredentials({
            accountId,
            projectId,
            reqCloudName,
            reqApiKey,
            reqApiSecret,
        });

        if (!creds.cloudName || !creds.apiKey || !creds.apiSecret) {
            return NextResponse.json(
                { error: 'Missing Cloudinary configuration' },
                { status: 400 }
            );
        }

        cloudinary.config({
            cloud_name: creds.cloudName,
            api_key: creds.apiKey,
            api_secret: creds.apiSecret,
            secure: true,
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
        return NextResponse.json(
            { error: error.message || 'Failed to update tag' },
            { status: 500 }
        );
    }
}
