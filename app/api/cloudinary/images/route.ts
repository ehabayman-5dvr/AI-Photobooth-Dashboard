import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { resolveCloudinaryCredentials } from '@/utils/cloudinaryServer';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const accountId = searchParams.get('accountId');
    const reqCloudName = searchParams.get('cloudName');
    const reqApiKey = searchParams.get('apiKey');
    const reqApiSecret = searchParams.get('apiSecret');
    const tag = searchParams.get('tag');
    const subtag = searchParams.get('subtag');
    const nextCursor = searchParams.get('next_cursor');
    const sort = searchParams.get('sort') || 'desc';

    try {
        const creds = await resolveCloudinaryCredentials({
            accountId,
            projectId,
            reqCloudName,
            reqApiKey,
            reqApiSecret,
        });

        if (!creds.cloudName || !creds.apiKey || !creds.apiSecret || !tag) {
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
            next_cursor: result.next_cursor,
            cloudName: creds.cloudName,
        });
    } catch (error: any) {
        console.error('Cloudinary API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch images' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            public_id,
            public_ids,
            projectId,
            accountId,
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
            return NextResponse.json(
                { error: 'Missing public_id to delete' },
                { status: 400 }
            );
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
