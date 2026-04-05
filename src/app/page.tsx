'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useFamilyStore, type Task, type Member } from '@/lib/store'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type TaskFormData = {
  title: string
  type: 'homework' | 'chore' | 'appointment' | 'other'
  assigned_to: string
  due_date: string
  description: string
}

const TYPE_LABELS: Record<string, string> = {
  homework: '📚 שיעורי בית',
  chore: '🧹 עבודות בית',
  appointment: '📅 פגישה',
  other: '📌 אחר',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין',
  in_progress: 'בתהליך',
  done: 'הושלם',
  deleted: 'בארכיון',
}

const STATUS_NEXT: Record<string, Task['status']> = {
  pending: 'in_progress',
  in_progress: 'done',
  done: 'done',
}

const STATUS_PREV: Record<string, Task['status']> = {
  done: 'in_progress',
  in_progress: 'pending',
  pending: 'pending',
}

const COLUMN_CONFIG = [
  { status: 'pending', label: 'ממתין', color: 'border-yellow-400', headerBg: 'bg-yellow-50', dot: 'bg-yellow-400' },
  { status: 'in_progress', label: 'בתהליך', color: 'border-blue-400', headerBg: 'bg-blue-50', dot: 'bg-blue-400' },
  { status: 'done', label: 'הושלם', color: 'border-green-400', headerBg: 'bg-green-50', dot: 'bg-green-400' },
] as const

function TaskCard({
  task,
  members,
  onStatusChange,
  onOwnerChange,
  onDelete,
}: {
  task: Task
  members: Member[]
  onStatusChange: (id: string, status: Task['status']) => void
  onOwnerChange: (id: string, memberId: string) => void
  onDelete: (id: string) => void
}) {
  const [showOwner, setShowOwner] = useState(false)
  const assignee = members.find((m) => m.id === task.assigned_to)

  return (
    <div className="bg-white rounded-xl border shadow-sm p-3 space-y-2 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-medium text-gray-800 leading-tight flex-1">{task.title}</p>
        <button
          onClick={() => onDelete(task.id)}
          className="text-gray-300 hover:text-red-400 text-xs flex-shrink-0 mt-0.5"
          title="העבר לארכיון"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
        <span>{TYPE_LABELS[task.type]}</span>
        {task.due_date && <span>📅 {new Date(task.due_date).toLocaleDateString('he-IL')}</span>}
        {task.source === 'calendar' && <span className="text-blue-400" title="Google Calendar">📆</span>}
        {task.source === 'whatsapp' && <span className="text-green-400" title="WhatsApp">💬</span>}
      </div>

      {task.description && (
        <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{task.description}</p>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-gray-50">
        {/* Owner badge / change */}
        <div className="relative">
          <button
            onClick={() => setShowOwner(!showOwner)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors"
          >
            {assignee ? (
              <>
                {assignee.avatar_url ? (
                  <img src={assignee.avatar_url} className="w-4 h-4 rounded-full" alt="" />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                    {assignee.name[0]}
                  </span>
                )}
                <span>{assignee.name}</span>
              </>
            ) : (
              <span className="text-gray-300">+ שבץ</span>
            )}
          </button>
          {showOwner && (
            <div className="absolute bottom-6 right-0 bg-white border rounded-lg shadow-lg z-20 min-w-28 py-1">
              <button
                onClick={() => { onOwnerChange(task.id, ''); setShowOwner(false) }}
                className="w-full text-right px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
              >
                ללא שיבוץ
              </button>
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { onOwnerChange(task.id, m.id); setShowOwner(false) }}
                  className={`w-full text-right px-3 py-1.5 text-xs hover:bg-gray-50 ${m.id === task.assigned_to ? 'font-semibold text-blue-600' : 'text-gray-700'}`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status arrows */}
        <div className="flex items-center gap-1">
          {task.status !== 'pending' && (
            <button
              onClick={() => onStatusChange(task.id, STATUS_PREV[task.status])}
              className="text-gray-300 hover:text-blue-500 text-xs px-1"
              title="הקדם"
            >
              ←
            </button>
          )}
          {task.status !== 'done' && (
            <button
              onClick={() => onStatusChange(task.id, STATUS_NEXT[task.status])}
              className="text-gray-300 hover:text-green-500 text-xs px-1"
              title="קדם"
            >
              →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const { familyId, members, tasks, isLoading, loadFamily, addTask, updateTask, deleteTask, restoreTask, subscribeToRealtime } = useFamilyStore()
  const [userName, setUserName] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [currentMemberId, setCurrentMemberId] = useState('')
  const [showAddTask, setShowAddTask] = useState(false)
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [filterMember, setFilterMember] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [showShare, setShowShare] = useState(false)
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState<TaskFormData>({ title: '', type: 'chore', assigned_to: '', due_date: '', description: '' })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push('/login')

      setCurrentUserId(user.id)
      setUserName(user.user_metadata?.full_name?.split(' ')[0] ?? 'משתמש')

      const { data: member } = await supabase
        .from('members')
        .select('id, family_id')
        .eq('user_id', user.id)
        .single()

      if (!member) return router.push('/onboarding')
      setCurrentMemberId(member.id)

      await loadFamily(member.family_id)

      // Fetch invite code
      const { data: family } = await supabase
        .from('families')
        .select('invite_code')
        .eq('id', member.family_id)
        .single()
      if (family) setInviteCode(family.invite_code)
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
      assigned_to: form.assigned_to || currentMemberId,
      family_id: familyId,
      created_by: user.id,
      status: 'pending',
      source: 'manual',
    })

    setForm({ title: '', type: 'chore', assigned_to: '', due_date: '', description: '' })
    setShowAddTask(false)
  }

  const handleStatusChange = (id: string, status: Task['status']) => updateTask(id, { status })
  const handleOwnerChange = (id: string, memberId: string) => updateTask(id, { assigned_to: memberId || undefined })

  // Filtered active tasks
  const activeTasks = tasks.filter((t) =>
    t.status !== 'deleted' &&
    (!filterMember || t.assigned_to === filterMember)
  )
  const deletedTasks = tasks.filter((t) => t.status === 'deleted')

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
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏠</span>
            <h1 className="text-xl font-bold text-gray-800">FamilyHub</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600 text-sm">שלום, {userName}!</span>
            {inviteCode && (
              <div className="relative">
                <button
                  onClick={() => setShowShare(!showShare)}
                  className="text-sm text-gray-400 hover:text-blue-500 transition-colors"
                  title="שתף לוח עם בן משפחה"
                >
                  👥 שתף
                </button>

                {showShare && (
                  <div className="absolute left-0 top-9 bg-white border rounded-2xl shadow-xl p-5 w-72 z-50" dir="rtl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-800">הזמן בן משפחה</h3>
                      <button onClick={() => setShowShare(false)} className="text-gray-300 hover:text-gray-500">✕</button>
                    </div>

                    <p className="text-xs text-gray-500 mb-3">שלח את הקוד הבא לבן המשפחה. הם יוכלו להצטרף דרך מסך הכניסה ולבחור את תפקידם (הורה / ילד).</p>

                    <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-center py-4 mb-3">
                      <p className="text-xs text-gray-400 mb-1">קוד הצטרפות</p>
                      <p className="font-mono text-2xl font-bold text-gray-800 tracking-widest">{inviteCode}</p>
                    </div>

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(inviteCode)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 2000)
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                    >
                      {copied ? '✓ הועתק!' : 'העתק קוד'}
                    </button>
                  </div>
                )}
              </div>
            )}
            <Link href="/settings/integrations" className="text-sm text-gray-400 hover:text-blue-500 transition-colors">
              🔌
            </Link>
            <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-red-500 transition-colors">
              התנתק
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Members */}
        {members.length > 0 && (
          <section className="mb-5">
            <div className="flex gap-2 flex-wrap">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2 bg-white rounded-full px-3 py-1.5 shadow-sm border">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt={m.name} className="w-6 h-6 rounded-full" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 font-medium text-xs">
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

        {/* Controls */}
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg border bg-white overflow-hidden">
              <button
                onClick={() => setView('kanban')}
                className={`px-3 py-1.5 text-sm transition-colors ${view === 'kanban' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                📋 קנבן
              </button>
              <button
                onClick={() => setView('list')}
                className={`px-3 py-1.5 text-sm transition-colors ${view === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                ☰ רשימה
              </button>
            </div>

            {/* Owner filter */}
            <select
              value={filterMember}
              onChange={(e) => setFilterMember(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">כולם</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowAddTask(!showAddTask)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            + הוסף משימה
          </button>
        </div>

        {/* Add Task Form */}
        {showAddTask && (
          <div className="bg-white rounded-xl shadow-sm border p-5 mb-5">
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
                  <option value="">ברירת מחדל (אני)</option>
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

        {/* ─── KANBAN VIEW ─── */}
        {view === 'kanban' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {COLUMN_CONFIG.map(({ status, label, color, headerBg, dot }) => {
              const col = activeTasks.filter((t) => t.status === status)
              return (
                <div key={status} className={`rounded-xl border-t-4 ${color} bg-white shadow-sm`}>
                  <div className={`${headerBg} rounded-t-xl px-4 py-2.5 flex items-center gap-2`}>
                    <span className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className="text-sm font-semibold text-gray-700">{label}</span>
                    <span className="mr-auto text-xs text-gray-400 bg-white rounded-full px-2 py-0.5">{col.length}</span>
                  </div>
                  <div className="p-3 space-y-2 min-h-24">
                    {col.length === 0 && (
                      <p className="text-xs text-gray-300 text-center py-4">אין משימות</p>
                    )}
                    {col.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        members={members}
                        onStatusChange={handleStatusChange}
                        onOwnerChange={handleOwnerChange}
                        onDelete={deleteTask}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ─── LIST VIEW ─── */}
        {view === 'list' && (
          <>
            {activeTasks.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-5xl mb-3">✅</div>
                <p>אין משימות פתוחות</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeTasks.map((task) => {
                  const assignee = members.find((m) => m.id === task.assigned_to)
                  return (
                    <div key={task.id} className="bg-white rounded-xl shadow-sm border p-4 flex items-start gap-3">
                      <button
                        onClick={() => handleStatusChange(task.id, 'done')}
                        className="mt-0.5 w-5 h-5 rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 transition-colors flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-medium text-gray-800 text-sm leading-tight">{task.title}</h3>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <select
                              value={task.status}
                              onChange={(e) => handleStatusChange(task.id, e.target.value as Task['status'])}
                              className="text-xs border rounded px-1 py-0.5 focus:outline-none"
                            >
                              <option value="pending">ממתין</option>
                              <option value="in_progress">בתהליך</option>
                              <option value="done">הושלם</option>
                            </select>
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="text-gray-300 hover:text-red-400 text-sm transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400 flex-wrap">
                          <span>{TYPE_LABELS[task.type]}</span>
                          {task.due_date && <span>📅 {new Date(task.due_date).toLocaleDateString('he-IL')}</span>}
                          {task.source === 'calendar' && <span className="text-blue-400">📆</span>}
                          {task.source === 'whatsapp' && <span className="text-green-400">💬</span>}
                          {/* Inline owner change */}
                          <select
                            value={task.assigned_to ?? ''}
                            onChange={(e) => handleOwnerChange(task.id, e.target.value)}
                            className="border rounded px-1 py-0.5 text-xs focus:outline-none"
                          >
                            <option value="">ללא שיבוץ</option>
                            {members.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                        {task.description && <p className="text-xs text-gray-500 mt-1.5">{task.description}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ─── HISTORY (deleted tasks) ─── */}
        {deletedTasks.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-3"
            >
              <span>{showHistory ? '▼' : '▶'}</span>
              <span>ארכיון ({deletedTasks.length} משימות)</span>
            </button>

            {showHistory && (
              <div className="space-y-2">
                {deletedTasks.map((task) => {
                  const assignee = members.find((m) => m.id === task.assigned_to)
                  return (
                    <div key={task.id} className="bg-gray-50 rounded-xl border border-dashed p-3 flex items-center gap-3 opacity-70">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-500 line-through">{task.title}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                          <span>{TYPE_LABELS[task.type]}</span>
                          {assignee && <span>👤 {assignee.name}</span>}
                          {task.due_date && <span>📅 {new Date(task.due_date).toLocaleDateString('he-IL')}</span>}
                          {task.source === 'calendar' && <span className="text-blue-300">📆</span>}
                          {task.source === 'whatsapp' && <span className="text-green-300">💬</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => restoreTask(task.id)}
                        className="text-xs text-blue-500 hover:text-blue-700 border border-blue-200 rounded px-2 py-1 flex-shrink-0 transition-colors"
                      >
                        שחזר
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
