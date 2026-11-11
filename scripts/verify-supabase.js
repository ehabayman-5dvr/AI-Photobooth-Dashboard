import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  console.log('🔍 Verifying Supabase project:', supabaseUrl);
  let allPassed = true;

  // 1. Check Tables
  const tables = ['allowed_users', 'profiles', 'global_settings', 'projects', 'project_members', 'usage_logs'];
  console.log('\n--- Checking Tables ---');
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.error(`❌ Table '${table}': ERROR - ${error.message}`);
      allPassed = false;
    } else {
      console.log(`✅ Table '${table}': Ready (rows: ${data ? data.length : 0})`);
    }
  }

  // 2. Check Allowed Users for Super Admin
  console.log('\n--- Checking Whitelist (allowed_users) ---');
  const targetEmail = 'ehab.ayman.gh@gmail.com';
  const { data: allowed, error: allowedErr } = await supabase
    .from('allowed_users')
    .select('*')
    .eq('email', targetEmail)
    .single();

  if (allowedErr || !allowed) {
    console.error(`❌ Allowed user '${targetEmail}': NOT FOUND (${allowedErr?.message})`);
    allPassed = false;
  } else {
    console.log(`✅ Allowed user '${targetEmail}': Present with role '${allowed.role}'`);
  }

  // 3. Check Profiles for Super Admin
  console.log('\n--- Checking Profiles ---');
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', targetEmail)
    .single();

  if (profErr || !profile) {
    console.warn(`⚠️ Profile for '${targetEmail}': NOT FOUND (${profErr?.message}). (User may need to sign in again if auth trigger hasn't fired yet).`);
  } else {
    console.log(`✅ Profile for '${targetEmail}': ID ${profile.id}, Name: '${profile.full_name}', Role: '${profile.role}'`);
  }

  // 4. Check Global Settings
  console.log('\n--- Checking Global Settings ---');
  const { data: settings, error: settErr } = await supabase
    .from('global_settings')
    .select('*')
    .eq('id', 'current')
    .single();

  if (settErr || !settings) {
    console.error(`❌ Global settings ('current'): NOT FOUND (${settErr?.message})`);
    allPassed = false;
  } else {
    console.log(`✅ Global settings ('current'): Ready`);
  }

  // 5. Check Project Settings Columns
  console.log('\n--- Checking Project Settings & Operator Columns ---');
  const { error: colErr } = await supabase
    .from('projects')
    .select('project_type, cloudinary_folder, ai_models_list, selected_ai_model, enable_printing, total_printed_copies, operator_settings')
    .limit(1);

  if (colErr) {
    console.warn(`⚠️ Project operator settings columns not yet migrated: ${colErr.message}`);
    console.warn('   Run supabase/migrations/20261109153000_add_project_operator_settings.sql in Supabase SQL Editor.');
    allPassed = false;
  } else {
    console.log('✅ Project operator settings columns: Ready');
  }

  console.log('\n=============================================');
  if (allPassed) {
    console.log('🎉 Database verification SUCCEEDED! Everything is configured properly.');
  } else {
    console.log('⚠️ Database verification incomplete. Please run the SQL schema migration in Supabase SQL Editor.');
  }
}

verify();
