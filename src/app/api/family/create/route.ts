import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // Verify the user is authenticated
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized - no user session found' }, { status: 401 })
  }

  // Use service role client to bypass RLS
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  console.log('Creating family for user:', user.id)

  const { familyName } = await request.json()
  if (!familyName?.trim()) {
    return NextResponse.json({ error: 'Family name is required' }, { status: 400 })
  }

  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase()

  const { data: family, error: familyError } = await admin
    .from('families')
    .insert({ name: familyName.trim(), invite_code: inviteCode, created_by: user.id })
    .select()
    .single()

  if (familyError) {
    console.error('Family insert error:', familyError)
    return NextResponse.json({ error: familyError.message, code: familyError.code }, { status: 500 })
  }

  const { error: memberError } = await admin.from('members').insert({
    family_id: family.id,
    user_id: user.id,
    name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'הורה',
    role: 'parent',
    avatar_url: user.user_metadata?.avatar_url,
  })

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
