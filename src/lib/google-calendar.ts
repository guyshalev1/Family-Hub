import { google } from 'googleapis'

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/callback`
  )
}

export async function getCalendarClient(accessToken: string, refreshToken: string) {
  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  return google.calendar({ version: 'v3', auth: oauth2Client })
}

const TASK_TYPE_COLORS: Record<string, number> = {
  homework: 1,    // blue
  chore: 2,       // green
  appointment: 3, // purple
  other: 5,       // yellow
}

export async function createCalendarEvent(
  accessToken: string,
  refreshToken: string,
  task: {
    title: string
    description?: string
    due_date: string
    type: string
    assigned_to_name: string
  }
) {
  const calendar = await getCalendarClient(accessToken, refreshToken)

  const event = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: `${task.title} - ${task.assigned_to_name}`,
      description: task.description,
      start: { date: task.due_date },
      end: { date: task.due_date },
      colorId: String(TASK_TYPE_COLORS[task.type] ?? 5),
    },
  })

  return event.data.id
}

export async function deleteCalendarEvent(
  accessToken: string,
  refreshToken: string,
  eventId: string
) {
  const calendar = await getCalendarClient(accessToken, refreshToken)
  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
  })
}

export async function listUpcomingEvents(
  accessToken: string,
  refreshToken: string,
  daysAhead = 30
) {
  const calendar = await getCalendarClient(accessToken, refreshToken)
  const now = new Date()
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100,
  })

  return response.data.items ?? []
}
