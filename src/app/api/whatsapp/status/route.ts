import { createClient } from '@/lib/supabase/server'
import { getInstanceState } from '@/lib/whatsapp'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: connection } = await supabase
    .from('whatsapp_connections')
    .select('*, whatsapp_groups(*)')
    .eq('user_id', user.id)
    .single()

  if (!connection) {
    return NextResponse.json({ connected: false, groups: [] })
  }

  // Check live state from Green API
  try {
    const state = await getInstanceState(connection.instance_id, connection.api_token)
    const isConnected = state === 'authorized'

    // Sync is_connected status if changed
    if (isConnected !== connection.is_connected) {
      await supabase
        .from('whatsapp_connections')
        .update({ is_connected: isConnected, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
    }

    return NextResponse.json({
      connected: isConnected,
      phone_number: connection.phone_number,
      groups: connection.whatsapp_groups ?? [],
    })
  } catch {
    return NextResponse.json({
      connected: connection.is_connected,
      phone_number: connection.phone_number,
      groups: connection.whatsapp_groups ?? [],
    })
  }
}
