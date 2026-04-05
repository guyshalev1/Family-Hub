import { create } from 'zustand'
import { createClient } from './supabase/client'

export type Member = {
  id: string
  name: string
  role: 'parent' | 'child'
  avatar_url?: string
}

export type Task = {
  id: string
  title: string
  description?: string
  assigned_to?: string
  due_date?: string
  status: 'pending' | 'in_progress' | 'done' | 'deleted'
  type: 'homework' | 'chore' | 'appointment' | 'other'
  created_by: string
  family_id: string
  gcal_event_id?: string
  source?: 'manual' | 'calendar' | 'whatsapp'
  external_id?: string
}

export type WeeklySchedule = {
  id: string
  member_id: string
  day_of_week: number
  status: 'home' | 'school' | 'vacation'
}

type FamilyStore = {
  familyId: string | null
  members: Member[]
  tasks: Task[]
  weeklySchedules: WeeklySchedule[]
  isLoading: boolean
  setFamilyId: (id: string) => void
  loadFamily: (familyId: string) => Promise<void>
  addTask: (task: Omit<Task, 'id'>) => Promise<Task | null>
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  restoreTask: (id: string) => Promise<void>
  subscribeToRealtime: (familyId: string) => () => void
}

export const useFamilyStore = create<FamilyStore>((set, get) => ({
  familyId: null,
  members: [],
  tasks: [],
  weeklySchedules: [],
  isLoading: false,

  setFamilyId: (id) => set({ familyId: id }),

  loadFamily: async (familyId) => {
    const supabase = createClient()
    set({ isLoading: true })

    const [membersRes, tasksRes, schedulesRes] = await Promise.all([
      supabase.from('members').select('*').eq('family_id', familyId),
      // Load all statuses — UI handles filtering
      supabase.from('tasks').select('*').eq('family_id', familyId).order('due_date'),
      supabase.from('weekly_schedules').select('*').eq('family_id', familyId),
    ])

    set({
      familyId,
      members: membersRes.data ?? [],
      tasks: tasksRes.data ?? [],
      weeklySchedules: schedulesRes.data ?? [],
      isLoading: false,
    })
  },

  addTask: async (task) => {
    const supabase = createClient()
    const { data, error } = await supabase.from('tasks').insert(task).select().single()
    if (!error && data) {
      set((state) => ({ tasks: [...state.tasks, data] }))
      return data
    }
    return null
  },

  updateTask: async (id, updates) => {
    const supabase = createClient()
    const prev = get().tasks.find((t) => t.id === id)
    const { error } = await supabase.from('tasks').update(updates).eq('id', id)
    if (!error) {
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      }))
      // Record history if status changed
      if (updates.status && prev?.status !== updates.status) {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('task_history').insert({
          task_id: id,
          user_id: user?.id,
          old_status: prev?.status ?? null,
          new_status: updates.status,
        })
      }
    }
  },

  // Soft delete — sets status to 'deleted' and keeps record for history
  deleteTask: async (id) => {
    const supabase = createClient()
    const prev = get().tasks.find((t) => t.id === id)
    await supabase.from('tasks').update({ status: 'deleted' }).eq('id', id)
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status: 'deleted' } : t)),
    }))
    if (prev) {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('task_history').insert({
        task_id: id,
        user_id: user?.id,
        old_status: prev.status,
        new_status: 'deleted',
      })
    }
  },

  // Restore deleted task back to pending
  restoreTask: async (id) => {
    const supabase = createClient()
    await supabase.from('tasks').update({ status: 'pending' }).eq('id', id)
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status: 'pending' } : t)),
    }))
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('task_history').insert({
      task_id: id,
      user_id: user?.id,
      old_status: 'deleted',
      new_status: 'pending',
    })
  },

  subscribeToRealtime: (familyId) => {
    const supabase = createClient()
    const channel = supabase
      .channel(`family:${familyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `family_id=eq.${familyId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          set((state) => ({ tasks: [...state.tasks, payload.new as Task] }))
        } else if (payload.eventType === 'UPDATE') {
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === payload.new.id ? payload.new as Task : t)),
          }))
        } else if (payload.eventType === 'DELETE') {
          set((state) => ({ tasks: state.tasks.filter((t) => t.id !== payload.old.id) }))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  },
}))
