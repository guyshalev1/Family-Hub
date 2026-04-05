import { createClient } from '@/lib/supabase/server'
import { getQRCode, getInstanceState, setWebhookUrl } from '@/lib/whatsapp'
import { NextResponse } from 'next/server'

// POST /api/whatsapp/connect - Save credentials and set up webhook
export async function POST(request: Request) {
  const { instance_id, api_token } = await request.json()

  if (!instance_id || !api_token) {
    return NextResponse.json({ error: 'instance_id and api_token are required' }, { status: 400 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify credentials work
  let state: string
  try {
    state = await getInstanceState(instance_id, api_token)
  } catch {
    return NextResponse.json({ error: 'Invalid Green API credentials' }, { status: 400 })
  }

  // Configure webhook to receive incoming messages
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    await setWebhookUrl(instance_id, api_token, `${appUrl}/api/whatsapp/webhook`)
  } catch {
    // Non-fatal — webhook can be configured later
  }

  // Upsert connection record
  const { data: connection, error } = await supabase
    .from('whatsapp_connections')
    .upsert({
      user_id: user.id,
      instance_id,
      api_token,
      is_connected: state === 'authorized',
      connected_at: state === 'authorized' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ connection, state })
}

// GET /api/whatsapp/connect - Get QR code for scanning
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: connection } = await supabase
    .from('whatsapp_connections')
    .select('instance_id, api_token')
    .eq('user_id', user.id)
    .single()

  if (!connection) {
    return NextResponse.json({ error: 'No connection configured' }, { status: 404 })
  }

  const qr = await getQRCode(connection.instance_id, connection.api_token)
  return NextResponse.json(qr)
}

// DELETE /api/whatsapp/connect - Disconnect WhatsApp
export async function DELETE() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase.from('whatsapp_connections').delete().eq('user_id', user.id)
  return NextResponse.json({ success: true })
}
