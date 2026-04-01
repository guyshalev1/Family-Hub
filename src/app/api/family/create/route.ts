import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { familyName } = await request.json()
  if (!familyName?.trim()) {
    return NextResponse.json({ error: 'Family name is required' }, { status: 400 })
  }

  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase()

  const { data: family, error: familyError } = await supabase
    .from('families')
    .insert({ name: familyName.trim(), invite_code: inviteCode, created_by: user.id })
    .select()
    .single()

  if (familyError) {
    return NextResponse.json({ error: familyError.message }, { status: 500 })
  }

  const { error: memberError } = await supabase.from('members').insert({
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
