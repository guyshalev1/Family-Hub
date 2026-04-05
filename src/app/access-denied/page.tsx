'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function AccessDeniedPage() {
  const supabase = createClient()
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md text-center">
        <div className="text-5xl mb-4">🚫</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">אין גישה</h1>
        <p className="text-gray-500 mb-2">
          כתובת האימייל שלך אינה מאושרת למערכת זו.
        </p>
        <p className="text-sm text-gray-400 mb-8">
          בקש מאחד ההורים במשפחה לאשר את הגישה שלך ולשתף איתך את קוד ההצטרפות.
        </p>
        <button
          onClick={handleLogout}
          className="bg-gray-800 hover:bg-gray-900 text-white font-medium py-2.5 px-6 rounded-xl transition-colors"
        >
          חזור למסך הכניסה
        </button>
      </div>
    </div>
  )
}
