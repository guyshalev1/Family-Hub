import { createClient } from '@/lib/supabase/server'
import { extractTaskFromMessage, detectTaskType } from '@/lib/whatsapp'
import type { IncomingWebhook } from '@/lib/whatsapp'
import { NextResponse } from 'next/server'

// POST - Receive incoming WhatsApp messages from Green API webhook
export async function POST(request: Request) {
  const payload: IncomingWebhook = await request.json()

  // Only process incoming text messages
  if (payload.typeWebhook !== 'incomingMessageReceived') {
    return NextResponse.json({ ok: true })
  }

  const { senderData, messageData } = payload
  const chatId = senderData?.chatId ?? ''

  // Only process group messages
  if (!chatId.endsWith('@g.us')) {
    return NextResponse.json({ ok: true })
  }

  const text =
    messageData?.textMessageData?.textMessage ??
    messageData?.extendedTextMessageData?.text ??
    ''

  if (!text.trim()) return NextResponse.json({ ok: true })

  // Extract task from message
  const extracted = extractTaskFromMessage(text)
  if (!extracted.isTask) return NextResponse.json({ ok: true })

  const supabase = createClient()

  // Find which user owns this Green API instance (by matching instanceData idInstance)
  const instanceId = String(payload.instanceData?.idInstance ?? '')
  const { data: connection } = await supabase
    .from('whatsapp_connections')
    .select('user_id, id')
    .eq('instance_id', instanceId)
    .single()

  if (!connection) return NextResponse.json({ ok: true })

  // Check if this group is monitored
  const { data: group } = await supabase
    .from('whatsapp_groups')
    .select('is_monitored')
    .eq('connection_id', connection.id)
    .eq('group_id', chatId)
    .single()

  if (!group?.is_monitored) return NextResponse.json({ ok: true })

  // Get user's family
  const { data: member } = await supabase
    .from('members')
    .select('family_id')
    .eq('user_id', connection.user_id)
    .single()

  if (!member) return NextResponse.json({ ok: true })

  // Dedup: skip if same external_id exists
  const externalId = `wa:${payload.idMessage}`
  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('external_id', externalId)
    .single()

  if (existing) return NextResponse.json({ ok: true })

  // Create task
  await supabase.from('tasks').insert({
    family_id: member.family_id,
    title: extracted.title,
    description: extracted.description
      ? `${extracted.description}\n\n(מ: ${senderData.senderName} ב-${senderData.chatName})`
      : `(מ: ${senderData.senderName} ב-${senderData.chatName})`,
    due_date: extracted.due_date ?? null,
    type: detectTaskType(extracted.title),
    status: 'pending',
    source: 'whatsapp',
    external_id: externalId,
    created_by: connection.user_id,
  })

  return NextResponse.json({ ok: true })
}
