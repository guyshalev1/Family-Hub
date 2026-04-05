// Green API client for WhatsApp integration
// Users need a free account at https://green-api.com to get instanceId and apiToken
// Free tier: 1 instance, limited messages/month

const GREEN_API_BASE = 'https://api.green-api.com'

export type InstanceState = 'authorized' | 'notAuthorized' | 'blocked' | 'starting' | 'yellowCard'

export type GreenAPIChat = {
  id: string        // e.g. "972501234567@c.us" or "120363XXXX@g.us"
  name: string
  type: 'group' | 'private'
}

export type IncomingWebhook = {
  typeWebhook: string
  instanceData: { idInstance: number; wid: string; typeInstance: string }
  timestamp: number
  idMessage: string
  senderData: {
    chatId: string
    chatName: string
    sender: string
    senderName: string
  }
  messageData: {
    typeMessage: string
    textMessageData?: { textMessage: string }
    extendedTextMessageData?: { text: string }
  }
}

export async function getInstanceState(
  instanceId: string,
  apiToken: string
): Promise<InstanceState> {
  const res = await fetch(`${GREEN_API_BASE}/waInstance${instanceId}/getStateInstance/${apiToken}`)
  if (!res.ok) throw new Error('Failed to get instance state')
  const data = await res.json()
  return data.stateInstance
}

export async function getQRCode(instanceId: string, apiToken: string) {
  const res = await fetch(`${GREEN_API_BASE}/waInstance${instanceId}/qr/${apiToken}`)
  if (!res.ok) throw new Error('Failed to get QR code')
  return res.json() as Promise<{ type: 'qrCode' | 'alreadyLogged' | 'error'; message: string }>
}

export async function getChats(instanceId: string, apiToken: string): Promise<GreenAPIChat[]> {
  const res = await fetch(`${GREEN_API_BASE}/waInstance${instanceId}/getChats/${apiToken}`)
  if (!res.ok) throw new Error('Failed to get chats')
  // Green API may return name in different fields depending on version/plan
  const chats: Array<{ id: string; name?: string; subject?: string; groupName?: string }> = await res.json()
  return chats.map((c) => ({
    id: c.id,
    name: c.name || c.subject || c.groupName || c.id,
    type: c.id.endsWith('@g.us') ? 'group' : 'private',
  }))
}

export async function getGroupName(instanceId: string, apiToken: string, groupId: string): Promise<string> {
  try {
    const res = await fetch(`${GREEN_API_BASE}/waInstance${instanceId}/getGroupData/${apiToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId }),
    })
    if (!res.ok) return groupId
    const data = await res.json()
    return data.subject || data.name || groupId
  } catch {
    return groupId
  }
}

// Poll one pending notification from the Green API queue
export async function receiveNotification(instanceId: string, apiToken: string) {
  const res = await fetch(`${GREEN_API_BASE}/waInstance${instanceId}/receiveNotification/${apiToken}`)
  if (!res.ok) return null
  const data = await res.json()
  return data as { receiptId: number; body: IncomingWebhook } | null
}

// Acknowledge and remove a notification from the queue
export async function deleteNotification(instanceId: string, apiToken: string, receiptId: number) {
  await fetch(`${GREEN_API_BASE}/waInstance${instanceId}/deleteNotification/${apiToken}/${receiptId}`, {
    method: 'DELETE',
  })
}

export async function setWebhookUrl(
  instanceId: string,
  apiToken: string,
  webhookUrl: string
): Promise<void> {
  const res = await fetch(`${GREEN_API_BASE}/waInstance${instanceId}/setSettings/${apiToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      webhookUrl,
      delaySendMessagesMilliseconds: 1000,
      markIncomingMessagesReaded: 'no',
      outgoingWebhook: 'no',
      incomingWebhook: 'yes',
      outgoingAPIMessageWebhook: 'no',
    }),
  })
  if (!res.ok) throw new Error('Failed to set webhook URL')
}

// Task keywords to detect in messages (Hebrew + English)
const TASK_TRIGGERS = [
  /^(?:משימה|תזכורת|לזכור|reminder|task|todo|to-do)[:\s]/i,
  /#(?:משימה|תזכורת|task|reminder|todo)/i,
]

// Date patterns in Hebrew messages
const DATE_PATTERNS = [
  /(?:ב|עד|on|by)\s+(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)/,
  /(?:מחר|tomorrow)/i,
  /(?:שבת|שישי|חמישי|רביעי|שלישי|שני|ראשון)/,
]

export function extractTaskFromMessage(text: string): {
  isTask: boolean
  title: string
  description?: string
  due_date?: string
} {
  const isTask = TASK_TRIGGERS.some((re) => re.test(text))
  if (!isTask) return { isTask: false, title: '' }

  // Strip the trigger prefix to get the title
  let title = text
    .replace(/^(?:משימה|תזכורת|לזכור|reminder|task|todo|to-do)[:\s]+/i, '')
    .replace(/#(?:משימה|תזכורת|task|reminder|todo)\s*/gi, '')
    .trim()

  // Keep first line as title, rest as description
  const lines = title.split('\n').map((l) => l.trim()).filter(Boolean)
  title = lines[0] || text.trim()
  const description = lines.length > 1 ? lines.slice(1).join('\n') : undefined

  // Try to extract a due date
  let due_date: string | undefined
  if (/מחר|tomorrow/i.test(text)) {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    due_date = tomorrow.toISOString().split('T')[0]
  } else {
    const dateMatch = DATE_PATTERNS[0].exec(text)
    if (dateMatch) {
      const parts = dateMatch[1].split(/[./]/)
      if (parts.length >= 2) {
        const day = parts[0].padStart(2, '0')
        const month = parts[1].padStart(2, '0')
        const year = parts[2] ? (parts[2].length === 2 ? `20${parts[2]}` : parts[2]) : new Date().getFullYear()
        due_date = `${year}-${month}-${day}`
      }
    }
  }

  return { isTask: true, title, description, due_date }
}

export function detectTaskType(title: string): 'homework' | 'chore' | 'appointment' | 'other' {
  const lower = title.toLowerCase()
  if (/שיעורים|שיעורי בית|homework|study|לימוד/.test(lower)) return 'homework'
  if (/פגישה|appointment|meeting|דוקטור|רופא|doctor|dentist|שיניים/.test(lower)) return 'appointment'
  if (/ניקיון|כביסה|שטיפה|בישול|chore|clean|laundry|dishes|vacuum/.test(lower)) return 'chore'
  return 'other'
}
