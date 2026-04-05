import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { inviteCode } = await request.json()

  if (!inviteCode?.trim()) {
    return NextResponse.json({ error: 'קוד הזמנה נדרש' }, { status: 400 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check user isn't already in a family
  const { data: existing } = await supabase
    .from('members')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'כבר חבר במשפחה' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Find family by invite code
  const { data: family } = await admin
    .from('families')
    .select('id, name')
    .eq('invite_code', inviteCode.trim().toUpperCase())
    .single()

  if (!family) {
    return NextResponse.json({ error: 'קוד הזמנה לא תקין' }, { status: 404 })
  }

  // Add user as parent member
  const { error } = await admin.from('members').insert({
    family_id: family.id,
    user_id: user.id,
    name: user.user_metadata?.full_name ?? user.email ?? 'חבר',
    role: 'parent',
    avatar_url: user.user_metadata?.avatar_url ?? null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ family_id: family.id, family_name: family.name })
}
