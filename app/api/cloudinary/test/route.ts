import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { resolveCloudinaryCredentials } from '@/utils/cloudinaryServer';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const { accountId, cloudName, apiKey, apiSecret } = body;

        const creds = await resolveCloudinaryCredentials({
            accountId,
            reqCloudName: cloudName,
            reqApiKey: apiKey,
            reqApiSecret: apiSecret,
        });

        if (!creds.cloudName || !creds.apiKey || !creds.apiSecret) {
            return NextResponse.json(
                { ok: false, error: 'Missing Cloud name, API key, or API secret' },
                { status: 400 }
            );
        }

        cloudinary.config({
            cloud_name: creds.cloudName,
            api_key: creds.apiKey,
            api_secret: creds.apiSecret,
            secure: true,
        });

        const ping = await cloudinary.api.ping();
        return NextResponse.json({
            ok: ping?.status === 'ok',
            cloudName: creds.cloudName,
            status: ping?.status || 'ok',
        });
    } catch (error: any) {
        const message =
            error?.error?.message ||
            error?.message ||
            'Cloudinary authentication failed';
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
}

