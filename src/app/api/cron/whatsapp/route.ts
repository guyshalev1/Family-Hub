import { createClient as createAdminClient } from '@supabase/supabase-js'
import { receiveNotification, deleteNotification, extractTaskFromMessage, detectTaskType } from '@/lib/whatsapp'
import type { IncomingWebhook } from '@/lib/whatsapp'
import { NextResponse } from 'next/server'

const MAX_MESSAGES_PER_RUN = 30

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get all connected WhatsApp instances
  const { data: connections } = await admin
    .from('whatsapp_connections')
    .select('*, whatsapp_groups(*)')
    .eq('is_connected', true)

  if (!connections?.length) return NextResponse.json({ processed: 0 })

  let totalProcessed = 0

  for (const connection of connections) {
    const monitoredGroupIds = new Set(
      (connection.whatsapp_groups ?? [])
        .filter((g: { is_monitored: boolean }) => g.is_monitored)
        .map((g: { group_id: string }) => g.group_id)
    )

    // Get user's family
    const { data: member } = await admin
      .from('members')
      .select('id, family_id')
      .eq('user_id', connection.user_id)
      .single()

    if (!member) continue

    let count = 0
    while (count < MAX_MESSAGES_PER_RUN) {
      let notification: { receiptId: number; body: IncomingWebhook } | null = null
      try {
        notification = await receiveNotification(connection.instance_id, connection.api_token)
      } catch {
        break
      }

      if (!notification) break

      const { receiptId, body } = notification

      try {
        if (body.typeWebhook === 'incomingMessageReceived') {
          const chatId = body.senderData?.chatId ?? ''

          if (chatId.endsWith('@g.us') && monitoredGroupIds.has(chatId)) {
            const text =
              body.messageData?.textMessageData?.textMessage ??
              body.messageData?.extendedTextMessageData?.text ??
              ''

            if (text.trim()) {
              const extracted = extractTaskFromMessage(text)

              if (extracted.isTask) {
                const externalId = `wa:${body.idMessage}`

                const { data: existing } = await admin
                  .from('tasks')
                  .select('id')
                  .eq('external_id', externalId)
                  .single()

                if (!existing) {
                  await admin.from('tasks').insert({
                    family_id: member.family_id,
                    title: extracted.title,
                    description: extracted.description
                      ? `${extracted.description}\n\n(מ: ${body.senderData.senderName} ב-${body.senderData.chatName})`
                      : `(מ: ${body.senderData.senderName} ב-${body.senderData.chatName})`,
                    due_date: extracted.due_date ?? null,
                    type: detectTaskType(extracted.title),
                    status: 'pending',
                    source: 'whatsapp',
                    external_id: externalId,
                    created_by: connection.user_id,
                  })
                  totalProcessed++
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Error processing WhatsApp message:', err)
      }

      // Always acknowledge the notification to remove it from the queue
      await deleteNotification(connection.instance_id, connection.api_token, receiptId).catch(() => {})
      count++
    }

    await admin
      .from('whatsapp_connections')
      .update({ last_poll_at: new Date().toISOString() })
      .eq('id', connection.id)
  }

  return NextResponse.json({ processed: totalProcessed })
}
