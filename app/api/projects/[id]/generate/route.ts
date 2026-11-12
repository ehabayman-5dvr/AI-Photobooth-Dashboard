import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Helper to get admin client safely
const getAdminClient = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
        throw new Error('Supabase credentials missing (URL or Key)');
    }

    return createClient(url, key);
};

// Helper to add CORS headers
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
        const amount = 1;
        const supabase = getAdminClient();

        // 1. Create a log entry
        const { error: logError } = await supabase
            .from('usage_logs')
            .insert([{ project_id: id, amount }]);

        if (logError) throw logError;

        // 2. Increment project total_usage using RPC
        const { error: updateError } = await supabase.rpc('increment_project_usage', {
            p_id: id,
            p_amount: amount
        });

        if (updateError) throw updateError;

        // 3. Read fresh live status & usage counters so the booth stays synced without extra calls
        const { data: updatedProject } = await supabase
            .from('projects')
            .select('is_active, total_usage, max_usage')
            .eq('id', id)
            .single();

        const isActive = updatedProject ? updatedProject.is_active !== false : true;
        const currentGenerations = Number(updatedProject?.total_usage) || 0;
        const dailyLimit = Number(updatedProject?.max_usage) || 1000;
        const remaining = Math.max(0, dailyLimit - currentGenerations);

        return NextResponse.json({
            success: true,
            projectId: id,
            incrementedBy: amount,
            isActive,
            currentGenerations,
            dailyLimit,
            remaining,
            timestamp: new Date().toISOString()
        }, {
            status: 200,
            headers: corsHeaders
        });
    } catch (error: any) {
        console.error('API Generation Error:', error);
        return NextResponse.json({
            success: false,
            message: error.message || 'Failed to increment generation count'
        }, {
            status: 500,
            headers: corsHeaders
        });
    }
}
