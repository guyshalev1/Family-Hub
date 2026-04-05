import { createClient } from '@/lib/supabase/server'
import { getChats } from '@/lib/whatsapp'
import { NextResponse } from 'next/server'

// GET - Fetch and sync groups from WhatsApp
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: connection } = await supabase
    .from('whatsapp_connections')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!connection) {
    return NextResponse.json({ error: 'No WhatsApp connection found' }, { status: 404 })
  }

  // Fetch live group list from Green API
  const chats = await getChats(connection.instance_id, connection.api_token)
  const groups = chats.filter((c) => c.type === 'group')

  // Get existing monitored groups from DB
  const { data: existingGroups } = await supabase
    .from('whatsapp_groups')
    .select('*')
    .eq('connection_id', connection.id)

  const monitoredIds = new Set((existingGroups ?? []).filter((g) => g.is_monitored).map((g) => g.group_id))

  // Upsert all groups (preserve is_monitored flag)
  if (groups.length > 0) {
    const upsertData = groups.map((g) => ({
      connection_id: connection.id,
      group_id: g.id,
      group_name: g.name,
      is_monitored: monitoredIds.has(g.id),
    }))

    await supabase
      .from('whatsapp_groups')
      .upsert(upsertData, { onConflict: 'connection_id,group_id' })
  }

  // Return groups with current monitoring state
  return NextResponse.json(
    groups.map((g) => ({ ...g, is_monitored: monitoredIds.has(g.id) }))
  )
}

// PATCH - Toggle group monitoring
export async function PATCH(request: Request) {
  const { group_id, is_monitored } = await request.json()

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: connection } = await supabase
    .from('whatsapp_connections')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!connection) {
    return NextResponse.json({ error: 'No WhatsApp connection found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('whatsapp_groups')
    .update({ is_monitored })
    .eq('connection_id', connection.id)
    .eq('group_id', group_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
