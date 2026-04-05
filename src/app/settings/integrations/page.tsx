'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type WhatsAppGroup = {
  id: string
  group_id: string
  group_name: string
  is_monitored: boolean
  type?: string
}

type WhatsAppStatus = {
  connected: boolean
  phone_number?: string
  groups: WhatsAppGroup[]
}

type GoogleStatus = {
  connected: boolean
  email?: string
  last_calendar_pull?: string
  calendar_sync_enabled?: boolean
}

type QRData = { type: 'qrCode' | 'alreadyLogged' | 'error'; message: string }

type WaStep = 'idle' | 'credentials' | 'qr' | 'connected'

export default function IntegrationsPage() {
  const router = useRouter()
  const supabase = createClient()

  // Google Calendar state
  const [google, setGoogle] = useState<GoogleStatus>({ connected: false })
  const [pulling, setPulling] = useState(false)
  const [pullResult, setPullResult] = useState<{ created: number; total: number } | null>(null)

  // WhatsApp state
  const [wa, setWa] = useState<WhatsAppStatus>({ connected: false, groups: [] })
  const [waStep, setWaStep] = useState<WaStep>('idle')
  const [instanceId, setInstanceId] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [qrData, setQrData] = useState<QRData | null>(null)
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [waError, setWaError] = useState('')
  const [saving, setSaving] = useState(false)

  // Load current status
  const loadStatuses = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return router.push('/login')

    // Google Calendar
    const { data: googleAccount } = await supabase
      .from('google_accounts')
      .select('email, last_calendar_pull, calendar_sync_enabled')
      .eq('user_id', user.id)
      .single()

    setGoogle({
      connected: !!googleAccount,
      email: googleAccount?.email,
      last_calendar_pull: googleAccount?.last_calendar_pull,
      calendar_sync_enabled: googleAccount?.calendar_sync_enabled ?? true,
    })

    // WhatsApp
    const res = await fetch('/api/whatsapp/status')
    if (res.ok) {
      const data = await res.json()
      setWa(data)
      if (data.connected) setWaStep('connected')
      else if (data.groups?.length >= 0 && !data.connected) {
        // Has credentials saved but not authorized yet
        const { data: conn } = await supabase
          .from('whatsapp_connections')
          .select('instance_id')
          .eq('user_id', user.id)
          .single()
        if (conn) setWaStep('qr')
      }
    }
  }, [router, supabase])

  useEffect(() => {
    loadStatuses()
  }, [loadStatuses])

  // Google: pull calendar events now
  const handleCalendarPull = async () => {
    setPulling(true)
    setPullResult(null)
    const res = await fetch('/api/calendar/pull', { method: 'POST' })
    const data = await res.json()
    setPulling(false)
    if (res.ok) setPullResult(data)
  }

  // WhatsApp: save credentials
  const handleWaSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setWaError('')
    const res = await fetch('/api/whatsapp/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance_id: instanceId, api_token: apiToken }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setWaError(data.error ?? 'שגיאה בחיבור')
      return
    }
    if (data.state === 'authorized') {
      setWaStep('connected')
      loadStatuses()
    } else {
      setWaStep('qr')
      loadQR()
    }
  }

  // WhatsApp: load QR code
  const loadQR = async () => {
    const res = await fetch('/api/whatsapp/connect')
    if (res.ok) {
      const data = await res.json()
      setQrData(data)
      if (data.type === 'alreadyLogged') {
        setWaStep('connected')
        loadStatuses()
      }
    }
  }

  // WhatsApp: fetch groups
  const handleFetchGroups = async () => {
    setLoadingGroups(true)
    const res = await fetch('/api/whatsapp/groups')
    setLoadingGroups(false)
    if (res.ok) {
      const groups = await res.json()
      setWa((prev) => ({ ...prev, groups }))
    }
  }

  // WhatsApp: toggle group monitoring
  const handleToggleGroup = async (group_id: string, is_monitored: boolean) => {
    await fetch('/api/whatsapp/groups', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id, is_monitored }),
    })
    setWa((prev) => ({
      ...prev,
      groups: prev.groups.map((g) =>
        g.group_id === group_id ? { ...g, is_monitored } : g
      ),
    }))
  }

  // WhatsApp: disconnect
  const handleWaDisconnect = async () => {
    await fetch('/api/whatsapp/connect', { method: 'DELETE' })
    setWa({ connected: false, groups: [] })
    setWaStep('idle')
    setInstanceId('')
    setApiToken('')
    setQrData(null)
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
            ← חזור
          </Link>
          <h1 className="text-xl font-bold text-gray-800">חיבורים ואינטגרציות</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* ─── Google Calendar ─── */}
        <section className="bg-white rounded-2xl shadow-sm border p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-xl">📅</div>
            <div>
              <h2 className="font-semibold text-gray-800">Google Calendar</h2>
              <p className="text-xs text-gray-500">ייבא אירועים כמשימות באופן אוטומטי</p>
            </div>
            <div className="mr-auto">
              {google.connected ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  מחובר
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  לא מחובר
                </span>
              )}
            </div>
          </div>

          {google.connected ? (
            <div className="space-y-4">
              <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-2">
                <span>📧</span>
                <span>{google.email}</span>
              </div>

              {google.last_calendar_pull && (
                <p className="text-xs text-gray-400">
                  סנכרון אחרון:{' '}
                  {new Date(google.last_calendar_pull).toLocaleString('he-IL')}
                </p>
              )}

              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={handleCalendarPull}
                  disabled={pulling}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {pulling ? '⏳ מייבא...' : '🔄 ייבא אירועים עכשיו'}
                </button>
              </div>

              {pullResult && (
                <div className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3">
                  נמצאו {pullResult.total} אירועים — נוצרו {pullResult.created} משימות חדשות
                </div>
              )}

              <p className="text-xs text-gray-400">
                משימות שנוצרות ידנית מסתנכרנות אוטומטית ל-Google Calendar שלך.
              </p>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              <p className="mb-3">
                התחבר עם Google כדי שנוכל לייבא אירועי יומן כמשימות ולשמור משימות חדשות ביומן שלך.
              </p>
              <p className="text-xs text-gray-400">
                החיבור מתבצע אוטומטית בעת ההתחברות עם Google OAuth. אם אין חיבור — התנתק והתחבר מחדש.
              </p>
            </div>
          )}
        </section>

        {/* ─── WhatsApp ─── */}
        <section className="bg-white rounded-2xl shadow-sm border p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-xl">💬</div>
            <div>
              <h2 className="font-semibold text-gray-800">WhatsApp</h2>
              <p className="text-xs text-gray-500">זהה משימות מהודעות בקבוצות משפחה</p>
            </div>
            <div className="mr-auto">
              {wa.connected ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  מחובר
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  לא מחובר
                </span>
              )}
            </div>
          </div>

          {/* Step: idle — show setup instructions */}
          {waStep === 'idle' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 space-y-1">
                <p className="font-medium">דרושה הגדרה חד-פעמית:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>פתח חשבון חינמי ב-<span className="font-medium">green-api.com</span></li>
                  <li>צור Instance חדש בלוח הבקרה</li>
                  <li>העתק את ה-Instance ID וה-API Token</li>
                  <li>הזן אותם כאן וסרוק QR עם הטלפון</li>
                </ol>
              </div>
              <button
                onClick={() => setWaStep('credentials')}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                הגדר חיבור WhatsApp
              </button>
            </div>
          )}

          {/* Step: credentials form */}
          {waStep === 'credentials' && (
            <form onSubmit={handleWaSaveCredentials} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Instance ID</label>
                <input
                  type="text"
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  placeholder="לדוגמה: 1101234567"
                  required
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">API Token</label>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="הדבק את ה-API Token מ-green-api.com"
                  required
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
              {waError && <p className="text-xs text-red-500">{waError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setWaStep('idle')}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
                >
                  {saving ? 'שומר...' : 'המשך'}
                </button>
              </div>
            </form>
          )}

          {/* Step: QR code */}
          {waStep === 'qr' && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-gray-600">סרוק את הקוד הבא מ-WhatsApp בטלפון שלך:</p>

              {qrData?.type === 'qrCode' ? (
                <div className="flex justify-center">
                  <img
                    src={`data:image/png;base64,${qrData.message}`}
                    alt="WhatsApp QR Code"
                    className="w-56 h-56 border rounded-xl"
                  />
                </div>
              ) : (
                <div className="text-4xl py-8">⏳</div>
              )}

              <div className="flex gap-2 justify-center">
                <button
                  onClick={loadQR}
                  className="text-sm text-blue-600 hover:underline"
                >
                  רענן QR
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => { setWaStep('connected'); loadStatuses() }}
                  className="text-sm text-green-600 hover:underline"
                >
                  סרקתי — המשך
                </button>
              </div>
            </div>
          )}

          {/* Step: connected — show group management */}
          {waStep === 'connected' && (
            <div className="space-y-4">
              {wa.phone_number && (
                <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-2">
                  <span>📱</span>
                  <span>{wa.phone_number}</span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700">קבוצות לניטור</h3>
                  <button
                    onClick={handleFetchGroups}
                    disabled={loadingGroups}
                    className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                  >
                    {loadingGroups ? 'טוען...' : '↻ רענן רשימה'}
                  </button>
                </div>

                {wa.groups.length === 0 ? (
                  <div className="text-center py-6 text-gray-400 text-sm border-2 border-dashed rounded-lg">
                    <p>לחץ "רענן רשימה" כדי לטעון את הקבוצות שלך</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {wa.groups.map((g) => (
                      <label
                        key={g.group_id}
                        className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={g.is_monitored}
                          onChange={(e) => handleToggleGroup(g.group_id, e.target.checked)}
                          className="w-4 h-4 accent-green-600"
                        />
                        <span className="text-sm text-gray-700">{g.group_name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-blue-50 rounded-lg px-4 py-3 text-xs text-blue-700 space-y-1">
                <p className="font-medium">כיצד זה עובד?</p>
                <p>
                  הודעות בקבוצות שבחרת שמתחילות ב-<span className="font-mono">משימה:</span>,{' '}
                  <span className="font-mono">תזכורת:</span> או <span className="font-mono">לזכור:</span>{' '}
                  יתווספו אוטומטית כמשימות.
                </p>
              </div>

              <button
                onClick={handleWaDisconnect}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                נתק WhatsApp
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
