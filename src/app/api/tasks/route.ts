import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const familyId = searchParams.get('family_id')

  if (!familyId) {
    return NextResponse.json({ error: 'family_id required' }, { status: 400 })
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('tasks')
    .select('*, members!assigned_to(name)')
    .eq('family_id', familyId)
    .order('due_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const body = await request.json()
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...body, source: body.source ?? 'manual', created_by: user.id })
    .select('*, members!assigned_to(name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-sync manual tasks to the creator's Google Calendar
  if ((body.source ?? 'manual') === 'manual' && data.due_date) {
    const { data: googleAccount } = await supabase
      .from('google_accounts')
      .select('access_token, refresh_token')
      .eq('user_id', user.id)
      .single()

    if (googleAccount) {
      const { createCalendarEvent } = await import('@/lib/google-calendar')
      const eventId = await createCalendarEvent(
        googleAccount.access_token,
        googleAccount.refresh_token,
        {
          title: data.title,
          description: data.description,
          due_date: data.due_date,
          type: data.type,
          assigned_to_name: data.members?.name ?? 'לא משובץ',
        }
      ).catch(() => null)

      if (eventId) {
        await supabase.from('tasks').update({ gcal_event_id: eventId }).eq('id', data.id)
        data.gcal_event_id = eventId
      }
    }
  }

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: Request) {
  const { id, ...updates } = await request.json()
  const supabase = createClient()

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const supabase = createClient()

  const { error } = await supabase.from('tasks').delete().eq('id', id!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
