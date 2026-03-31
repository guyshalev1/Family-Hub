import { createClient } from '@/lib/supabase/server'
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/google-calendar'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { taskId, action } = await request.json()
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

  if (action === 'create') {
    const { data: task } = await supabase
      .from('tasks')
      .select('*, members!assigned_to(name)')
      .eq('id', taskId)
      .single()

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const eventId = await createCalendarEvent(
      googleAccount.access_token,
      googleAccount.refresh_token,
      {
        title: task.title,
        description: task.description,
        due_date: task.due_date,
        type: task.type,
        assigned_to_name: task.members?.name ?? 'לא משובץ',
      }
    )

    await supabase.from('tasks').update({ gcal_event_id: eventId }).eq('id', taskId)
    return NextResponse.json({ eventId })
  }

  if (action === 'delete') {
    const { data: task } = await supabase
      .from('tasks')
      .select('gcal_event_id')
      .eq('id', taskId)
      .single()

    if (task?.gcal_event_id) {
      await deleteCalendarEvent(googleAccount.access_token, googleAccount.refresh_token, task.gcal_event_id)
      await supabase.from('tasks').update({ gcal_event_id: null }).eq('id', taskId)
    }

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
