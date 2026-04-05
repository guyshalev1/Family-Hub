import { createClient as createAdminClient } from '@supabase/supabase-js'
import { listChangedEvents } from '@/lib/google-calendar'
import { detectTaskType } from '@/lib/whatsapp'
import { NextResponse } from 'next/server'

// Vercel calls this with Authorization: Bearer <CRON_SECRET>
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get all users with connected Google accounts
  const { data: accounts } = await admin.from('google_accounts').select('*')
  if (!accounts?.length) return NextResponse.json({ synced: 0 })

  let totalCreated = 0
  let totalDeleted = 0

  for (const account of accounts) {
    try {
      // Find user's family and member ID
      const { data: member } = await admin
        .from('members')
        .select('id, family_id')
        .eq('user_id', account.user_id)
        .single()

      if (!member) continue

      // Incremental sync — use syncToken if we have one, else full sync
      let items: Awaited<ReturnType<typeof listChangedEvents>>['items']
      let nextSyncToken: string | null | undefined

      try {
        const result = await listChangedEvents(
          account.access_token,
          account.refresh_token,
          account.calendar_sync_token ?? undefined
        )
        items = result.items
        nextSyncToken = result.nextSyncToken
      } catch (err: any) {
        if (err?.code === 410 || err?.status === 410) {
          // Sync token expired — do a full sync
          const result = await listChangedEvents(account.access_token, account.refresh_token)
          items = result.items
          nextSyncToken = result.nextSyncToken
        } else {
          console.error(`Calendar sync error for ${account.email}:`, err)
          continue
        }
      }

      for (const event of items) {
        if (!event.id || !event.summary) continue
        const externalId = `gcal:${event.id}`

        if (event.status === 'cancelled') {
          // Mark corresponding task as deleted
          const { data: task } = await admin
            .from('tasks')
            .select('id, status')
            .eq('external_id', externalId)
            .single()

          if (task && task.status !== 'deleted') {
            await admin.from('tasks').update({ status: 'deleted' }).eq('id', task.id)
            await admin.from('task_history').insert({
              task_id: task.id,
              user_id: account.user_id,
              old_status: task.status,
              new_status: 'deleted',
            })
            totalDeleted++
          }
          continue
        }

        const startDate =
          event.start?.date ??
          event.start?.dateTime?.split('T')[0] ??
          new Date().toISOString().split('T')[0]

        // Check if task already exists
        const { data: existing } = await admin
          .from('tasks')
          .select('id, status, title, due_date')
          .eq('external_id', externalId)
          .single()

        if (existing) {
          // Update title/date if changed, but don't touch done/deleted tasks
          if (existing.status !== 'done' && existing.status !== 'deleted') {
            const updates: Record<string, string> = {}
            if (existing.title !== event.summary) updates.title = event.summary
            if (existing.due_date !== startDate) updates.due_date = startDate
            if (Object.keys(updates).length > 0) {
              await admin.from('tasks').update(updates).eq('id', existing.id)
            }
          }
        } else {
          // Create new task
          await admin.from('tasks').insert({
            family_id: member.family_id,
            title: event.summary,
            description: event.description ?? null,
            due_date: startDate,
            type: detectTaskType(event.summary),
            status: 'pending',
            source: 'calendar',
            external_id: externalId,
            gcal_event_id: event.id,
            created_by: account.user_id,
            assigned_to: member.id,
          })
          totalCreated++
        }
      }

      // Save the new sync token
      if (nextSyncToken) {
        await admin
          .from('google_accounts')
          .update({ calendar_sync_token: nextSyncToken, last_calendar_pull: new Date().toISOString() })
          .eq('id', account.id)
      }
    } catch (err) {
      console.error(`Failed sync for account ${account.email}:`, err)
    }
  }

  return NextResponse.json({ synced: accounts.length, created: totalCreated, deleted: totalDeleted })
}
