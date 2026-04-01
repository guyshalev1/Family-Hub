'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useFamilyStore } from '@/lib/store'
import { useRouter } from 'next/navigation'

type TaskFormData = {
  title: string
  type: 'homework' | 'chore' | 'appointment' | 'other'
  assigned_to: string
  due_date: string
  description: string
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const { familyId, members, tasks, isLoading, loadFamily, addTask, updateTask, deleteTask, subscribeToRealtime } = useFamilyStore()
  const [userName, setUserName] = useState('')
  const [showAddTask, setShowAddTask] = useState(false)
  const [form, setForm] = useState<TaskFormData>({ title: '', type: 'chore', assigned_to: '', due_date: '', description: '' })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push('/login')

      setUserName(user.user_metadata?.full_name?.split(' ')[0] ?? 'משתמש')

      const { data: member, error: memberError } = await supabase
        .from('members')
        .select('family_id')
        .eq('user_id', user.id)
        .single()

      console.log('member query result:', member, 'error:', memberError)
      if (!member) return router.push('/onboarding')

      await loadFamily(member.family_id)
    }

    init()
  }, [])

  useEffect(() => {
    if (!familyId) return
    return subscribeToRealtime(familyId)
  }, [familyId])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!familyId || !form.title) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await addTask({
      ...form,
      family_id: familyId,
      created_by: user.id,
      status: 'pending',
    })

    setForm({ title: '', type: 'chore', assigned_to: '', due_date: '', description: '' })
    setShowAddTask(false)
  }

  const typeLabels: Record<string, string> = {
    homework: '📚 שיעורי בית',
    chore: '🧹 עבודות בית',
    appointment: '📅 פגישה',
    other: '📌 אחר',
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    done: 'bg-green-100 text-green-800',
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-gray-500">טוען...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏠</span>
            <h1 className="text-xl font-bold text-gray-800">FamilyHub</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600 text-sm">שלום, {userName}!</span>
            <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-red-500 transition-colors">
              התנתק
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Members */}
        {members.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-700 mb-3">חברי המשפחה</h2>
            <div className="flex gap-3 flex-wrap">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm border">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt={m.name} className="w-7 h-7 rounded-full" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 font-medium text-sm">
                      {m.name[0]}
                    </div>
                  )}
                  <span className="text-sm font-medium">{m.name}</span>
                  <span className="text-xs text-gray-400">{m.role === 'parent' ? 'הורה' : 'ילד'}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tasks */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-700">משימות ({tasks.length})</h2>
            <button
              onClick={() => setShowAddTask(!showAddTask)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              + הוסף משימה
            </button>
          </div>

          {/* Add Task Form */}
          {showAddTask && (
            <div className="bg-white rounded-xl shadow-sm border p-5 mb-4">
              <h3 className="font-semibold mb-4 text-gray-800">משימה חדשה</h3>
              <form onSubmit={handleAddTask} className="space-y-3">
                <input
                  type="text"
                  placeholder="כותרת המשימה *"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  required
                />
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as TaskFormData['type'] })}
                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="chore">🧹 עבודות בית</option>
                    <option value="homework">📚 שיעורי בית</option>
                    <option value="appointment">📅 פגישה</option>
                    <option value="other">📌 אחר</option>
                  </select>
                  <select
                    value={form.assigned_to}
                    onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="">ללא שיבוץ</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <textarea
                  placeholder="תיאור (אופציונלי)"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                  rows={2}
                />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowAddTask(false)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
                    ביטול
                  </button>
                  <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
                    שמור
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Task List */}
          {tasks.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-3">✅</div>
              <p>אין משימות פתוחות</p>
              <p className="text-sm mt-1">לחץ על "הוסף משימה" כדי להתחיל</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => {
                const assignee = members.find((m) => m.id === task.assigned_to)
                return (
                  <div key={task.id} className="bg-white rounded-xl shadow-sm border p-4 flex items-start gap-3">
                    <button
                      onClick={() => updateTask(task.id, { status: 'done' })}
                      className="mt-0.5 w-5 h-5 rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 transition-colors flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium text-gray-800 text-sm leading-tight">{task.title}</h3>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[task.status]}`}>
                            {task.status === 'pending' ? 'ממתין' : task.status === 'in_progress' ? 'בתהליך' : 'הושלם'}
                          </span>
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="text-gray-300 hover:text-red-400 text-sm transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                        <span>{typeLabels[task.type]}</span>
                        {assignee && <span>👤 {assignee.name}</span>}
                        {task.due_date && <span>📅 {new Date(task.due_date).toLocaleDateString('he-IL')}</span>}
                      </div>
                      {task.description && <p className="text-xs text-gray-500 mt-1.5">{task.description}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
