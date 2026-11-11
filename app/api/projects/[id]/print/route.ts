import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminClient = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
        throw new Error('Supabase admin credentials missing');
    }

    return createClient(url, key);
};

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        let copies = 1;
        try {
            const body = await request.json();
            if (typeof body?.copies === 'number' && body.copies > 0) {
                copies = Math.floor(body.copies);
            } else if (typeof body?.amount === 'number' && body.amount > 0) {
                copies = Math.floor(body.amount);
            }
        } catch {
            // Body is optional, default to 1 copy
        }

        const supabase = getAdminClient();

        const { error: rpcError } = await supabase.rpc('increment_project_prints', {
            p_id: id,
            p_copies: copies,
        });

        if (rpcError) {
            // Fallback direct update if RPC isn't migrated yet
            const { data: current } = await supabase
                .from('projects')
                .select('total_printed_copies')
                .eq('id', id)
                .single();

            const nextTotal = (current?.total_printed_copies || 0) + copies;
            const { error: fallbackErr } = await supabase
                .from('projects')
                .update({
                    total_printed_copies: nextTotal,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id);

            if (fallbackErr) {
                if (fallbackErr.code === 'PGRST204') {
                    return NextResponse.json(
                        {
                            success: false,
                            code: 'PGRST204',
                            message: "Database migration missing: Run supabase/migrations/20261109153000_add_project_operator_settings.sql in your Supabase SQL Editor to add 'total_printed_copies'.",
                        },
                        { status: 500, headers: corsHeaders }
                    );
                }
                throw fallbackErr;
            }
        }

        return NextResponse.json(
            {
                success: true,
                projectId: id,
                incrementedBy: copies,
                timestamp: new Date().toISOString(),
            },
            { status: 200, headers: corsHeaders }
        );
    } catch (error: any) {
        console.error('API Print Increment Error:', error);
        return NextResponse.json(
            {
                success: false,
                message: error.message || 'Failed to increment printed copies count',
            },
            { status: 500, headers: corsHeaders }
        );
    }
}

