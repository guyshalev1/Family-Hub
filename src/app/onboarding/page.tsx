'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const [familyName, setFamilyName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleCreateFamily = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!familyName.trim()) return

    setIsLoading(true)
    setError('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }
    const user = session.user

    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase()

    const { data: family, error: familyError } = await supabase
      .from('families')
      .insert({ name: familyName.trim(), invite_code: inviteCode, created_by: user.id })
      .select()
      .single()

    if (familyError) {
      setError(`שגיאה: ${familyError.message}`)
      setIsLoading(false)
      return
    }

    await supabase.from('members').insert({
      family_id: family.id,
      user_id: user.id,
      name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'הורה',
      role: 'parent',
      avatar_url: user.user_metadata?.avatar_url,
    })

    router.push('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">ברוך הבא! 👋</h1>
        <p className="text-gray-500 text-center mb-8">בוא ניצור את המשפחה שלך</p>

        <form onSubmit={handleCreateFamily} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם המשפחה</label>
            <input
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="משפחת כהן"
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
      </div>
    </div>
  )
}
