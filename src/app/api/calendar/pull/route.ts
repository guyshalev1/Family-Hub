import { createClient } from '@/lib/supabase/server'
import { listUpcomingEvents } from '@/lib/google-calendar'
import { detectTaskType } from '@/lib/whatsapp'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get Google tokens
  const { data: googleAccount } = await supabase
    .from('google_accounts')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!googleAccount) {
    return NextResponse.json({ error: 'No Google account connected' }, { status: 400 })
  }

  // Get user's family
  const { data: member } = await supabase
    .from('members')
    .select('family_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'No family found' }, { status: 400 })
  }

  // Fetch upcoming events from Google Calendar
  const events = await listUpcomingEvents(
    googleAccount.access_token,
    googleAccount.refresh_token,
    30
  )

  // Get existing external_ids to avoid duplicates
  const externalIds = events.map((e) => `gcal:${e.id}`).filter(Boolean)
  const { data: existingTasks } = await supabase
    .from('tasks')
    .select('external_id')
    .eq('family_id', member.family_id)
    .in('external_id', externalIds)

  const existingExternalIds = new Set((existingTasks ?? []).map((t) => t.external_id))

  // Create tasks for new events
  const newTasks = events
    .filter((event) => {
      if (!event.id || !event.summary) return false
      const extId = `gcal:${event.id}`
      return !existingExternalIds.has(extId)
    })
    .map((event) => {
      const startDate =
        event.start?.date ??
        event.start?.dateTime?.split('T')[0] ??
        new Date().toISOString().split('T')[0]

      return {
        family_id: member.family_id,
        title: event.summary!,
        description: event.description ?? undefined,
        due_date: startDate,
        type: detectTaskType(event.summary ?? ''),
        status: 'pending' as const,
        source: 'calendar' as const,
        external_id: `gcal:${event.id}`,
        created_by: user.id,
        gcal_event_id: event.id,
      }
    })

  if (newTasks.length > 0) {
    const { error } = await supabase.from('tasks').insert(newTasks)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update last pull timestamp
  await supabase
    .from('google_accounts')
    .update({ last_calendar_pull: new Date().toISOString() })
    .eq('user_id', user.id)

  return NextResponse.json({ created: newTasks.length, total: events.length })
}
