'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [familyName, setFamilyName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [role, setRole] = useState<'parent' | 'child'>('parent')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleCreateFamily = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!familyName.trim()) return
    setIsLoading(true)
    setError('')

    const res = await fetch('/api/family/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyName: familyName.trim() }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(`שגיאה: ${data.error}`)
      setIsLoading(false)
      return
    }
    window.location.href = '/'
  }

  const handleJoinFamily = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteCode.trim()) return
    setIsLoading(true)
    setError('')

    const res = await fetch('/api/family/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode: inviteCode.trim(), role }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(`שגיאה: ${data.error}`)
      setIsLoading(false)
      return
    }
    window.location.href = '/'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">ברוך הבא! 👋</h1>
        <p className="text-gray-500 text-center mb-6">הצטרף למשפחה קיימת או צור חדשה</p>

        {/* Tab toggle */}
        <div className="flex rounded-xl border bg-gray-50 p-1 mb-6">
          <button
            onClick={() => { setTab('create'); setError('') }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'create' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
          >
            צור משפחה
          </button>
          <button
            onClick={() => { setTab('join'); setError('') }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'join' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
          >
            הצטרף למשפחה
          </button>
        </div>

        {tab === 'create' ? (
          <form onSubmit={handleCreateFamily} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם המשפחה</label>
              <input
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="משפחת שלו"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={isLoading || !familyName.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {isLoading ? 'יוצר...' : 'צור משפחה'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoinFamily} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">קוד הזמנה</label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="לדוגמה: AB12CD"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-center font-mono text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-400"
                maxLength={6}
                required
              />
              <p className="text-xs text-gray-400 mt-1">בקש את הקוד מחבר המשפחה שיצר את הקבוצה</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">תפקיד במשפחה</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('parent')}
                  className={`py-3 rounded-xl border-2 text-sm font-medium transition-colors ${role === 'parent' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                >
                  👨‍👩‍👧 הורה
                </button>
                <button
                  type="button"
                  onClick={() => setRole('child')}
                  className={`py-3 rounded-xl border-2 text-sm font-medium transition-colors ${role === 'child' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                >
                  🧒 ילד
                </button>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={isLoading || !inviteCode.trim()}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {isLoading ? 'מצטרף...' : 'הצטרף למשפחה'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
