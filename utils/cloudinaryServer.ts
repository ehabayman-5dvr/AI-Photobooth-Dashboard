import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function getServerSupabaseClient(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        '';

    if (!url || !key) {
        throw new Error('Supabase credentials missing');
    }

    return createClient(url, key);
}

export interface ResolvedCloudinaryCredentials {
    accountId: string | null;
    accountLabel: string | null;
    cloudName: string;
    apiKey: string;
    apiSecret: string;
}

export async function resolveCloudinaryCredentials(options: {
    supabase?: SupabaseClient;
    accountId?: string | null;
    projectId?: string | null;
    projectRow?: any;
    reqCloudName?: string | null;
    reqApiKey?: string | null;
    reqApiSecret?: string | null;
}): Promise<ResolvedCloudinaryCredentials> {
    const reqCloud = options.reqCloudName?.trim() || '';
    const reqKey = options.reqApiKey?.trim() || '';
    const reqSecret = options.reqApiSecret?.trim() || '';

    // 1. Explicit full credentials (e.g., testing unsaved inputs in Global Settings)
    if (reqCloud && reqKey && reqSecret && !options.projectId && !options.accountId) {
        return {
            accountId: null,
            accountLabel: null,
            cloudName: reqCloud,
            apiKey: reqKey,
            apiSecret: reqSecret,
        };
    }

    const client = options.supabase || getServerSupabaseClient();

    let proj = options.projectRow || null;
    if (!proj && options.projectId) {
        const { data } = await client
            .from('projects')
            .select('id, cloudinary_account_id')
            .eq('id', options.projectId)
            .single();
        proj = data || null;
    }

    const targetAccountId = options.accountId || proj?.cloudinary_account_id || null;

    // 2. Resolve from cloudinary_accounts (assigned account -> default account -> first account)
    if (targetAccountId) {
        const { data: acc, error: accErr } = await client
            .from('cloudinary_accounts')
            .select('*')
            .eq('id', targetAccountId)
            .single();

        if (!accErr && acc && acc.cloud_name && acc.api_key && acc.api_secret) {
            return {
                accountId: acc.id,
                accountLabel: acc.label || acc.cloud_name,
                cloudName: acc.cloud_name.trim(),
                apiKey: acc.api_key.trim(),
                apiSecret: acc.api_secret.trim(),
            };
        }
    }

    const { data: accounts, error: listErr } = await client
        .from('cloudinary_accounts')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });

    if (!listErr && Array.isArray(accounts) && accounts.length > 0) {
        const matched = accounts.find(a => a.is_default) || accounts[0];
        if (matched && matched.cloud_name && matched.api_key && matched.api_secret) {
            return {
                accountId: matched.id,
                accountLabel: matched.label || matched.cloud_name,
                cloudName: matched.cloud_name.trim(),
                apiKey: matched.api_key.trim(),
                apiSecret: matched.api_secret.trim(),
            };
        }
    }

    return {
        accountId: null,
        accountLabel: null,
        cloudName: reqCloud,
        apiKey: reqKey,
        apiSecret: reqSecret,
    };
}
