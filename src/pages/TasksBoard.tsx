// src/pages/TasksBoard.tsx
import { useMemo, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/axios'
import Layout from '../components/Layout'

import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar'
import {
  format,
  parse,
  startOfWeek,
  getDay,
  addHours,
  isBefore,
  startOfDay,
  setHours,
  setMinutes,
  setSeconds,
} from 'date-fns'
import { es } from 'date-fns/locale';

type LeanUserObj = { _id: string; name?: string; lastName?: string; email?: string };

// 👇 Helper para mostrar "Nombre Apellido" con fallbacks
function displayUser(u: LeanUserObj | string | null | undefined): string {
  if (!u) return '—';
  if (typeof u === 'string') return u;
  const full = [u.name, u.lastName].filter(Boolean).join(' ');
  return full || u.email || u._id || '—';
}

type Task = {
  _id: string
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high'
  status?: 'open' | 'done'
  completedAt?: string | null
  completedBy?: LeanUserObj | string | null
  dueAt?: string | null
  ownerId?: LeanUserObj | string | null
  createdAt?: string | null
}

const locales = { es }
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

export default function TasksBoard() {
  const nav = useNavigate()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => (await api.get('/tasks')).data as Task[],
  })

  const abiertas = (data ?? []).filter((t) => (t.status ?? 'open') === 'open')
  const finalizadas = (data ?? []).filter((t) => t.status === 'done')

  const stats = [
    { title: 'Abiertas', value: abiertas.length },
    { title: 'Finalizadas', value: finalizadas.length },
    { title: 'Total', value: (data ?? []).length },
  ]

  // ---------- CALENDARIO: transformar tasks -> events ----------
  type CalendarEvent = {
    id: string
    title: string
    start: Date
    end: Date
    task: Task
  }

  const events: CalendarEvent[] = useMemo(() => {
    const tasks = (data ?? []).filter((t) => t.dueAt)
    return tasks.map((t) => {
      const start = new Date(t.dueAt!)
      const end = addHours(start, 1) // bloque de 1 hora
      return { id: t._id, title: t.title, start, end, task: t }
    })
  }, [data])

  // Colores según estado/prioridad/si ya pasó
  const eventPropGetter = useCallback((event: CalendarEvent) => {
    const now = new Date()
    const isPastDay = isBefore(event.start, startOfDay(now))
    const isDone = event.task.status === 'done'
    const isHigh = event.task.priority === 'high'
    const isOpen = (event.task.status ?? 'open') === 'open'

    let bg = '#FDE68A' // amarillo (pendiente)
    let color = '#111'
    let border = '1px solid rgba(0,0,0,.08)'

    if (isHigh && isOpen && !isPastDay) bg = '#FCA5A5' // rojo suave
    if (isPastDay && isOpen) {
      bg = '#E5E7EB' // gris para "ya pasó"
      color = '#374151'
    }
    if (isDone) {
      bg = '#E5E7EB' // gris para finalizadas
      color = '#6B7280'
      border = '1px dashed #9CA3AF'
    }

    return { style: { backgroundColor: bg, color, border, borderRadius: 8, fontWeight: 700, padding: '2px 6px' } }
  }, [])

  // Secciones colapsables (por defecto cerradas)
  const [showOpen, setShowOpen] = useState(false)
  const [showDone, setShowDone] = useState(false)

  // Click en bloque del calendario → detalle
  const onSelectEvent = useCallback(
    (event: CalendarEvent) => {
      nav(`/tasks/${event.id}`)
    },
    [nav],
  )

  // Horario visible: 06:00 -> 18:00
  const minTime = useMemo(() => setSeconds(setMinutes(setHours(new Date(), 6), 0), 0), [])
  const maxTime = useMemo(() => setSeconds(setMinutes(setHours(new Date(), 18), 0), 0), [])
  // Scroll inicial: 08:00
  const scrollTo = useMemo(() => setSeconds(setMinutes(setHours(new Date(), 8), 0), 0), [])

  // ---------- Helpers UI ----------
  const SectionHeader = ({
    open,
    onToggle,
    title,
    count,
  }: {
    open: boolean
    onToggle: () => void
    title: string
    count: number
  }) => (
    <button
      type="button"
      onClick={onToggle}
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        padding: '12px 14px',
      }}
      aria-expanded={open}
    >
      <span
        style={{
          display: 'inline-block',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform .15s',
          fontWeight: 800,
        }}
      >
        ▶
      </span>
      <span className="h2" style={{ margin: 0 }}>
        {title}
      </span>
      <span className="muted" style={{ marginLeft: 6 }}>
        ({count})
      </span>
    </button>
  )

  const TaskCardOpen = ({ t }: { t: Task }) => {
    const creator = t.ownerId
    const creatorLabel = displayUser(creator as any)

    return (
      <div
        id={`task-${t._id}`}
        className="card"
        style={{ cursor: 'pointer' }}
        onClick={() => nav(`/tasks/${t._id}`)}
        title="Ver detalle"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <h3 className="card-title" style={{ marginBottom: 4 }}>
            {t.title}
          </h3>
          {t.priority && (
            <span
              className={`badge ${
                t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'amber' : 'green'
              }`}
            >
              Prioridad: {t.priority}
            </span>
          )}
        </div>

        {t.dueAt && (
          <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
            Vence: {new Date(t.dueAt).toLocaleString()}
          </div>
        )}

        {creator && (
          <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
            Creada por {creatorLabel}
            {t.createdAt ? ` — ${new Date(t.createdAt).toLocaleString()}` : ''}
          </div>
        )}

        <div className="btn-row mt-16">
          <button
            className="btn btn-outline"
            onClick={(e) => {
              e.stopPropagation()
              nav(`/tasks/${t._id}`)
            }}
          >
            Ver detalle
          </button>
        </div>
      </div>
    )
  }

  const TaskCardDone = ({ t }: { t: Task }) => {
    const finisher = t.completedBy
    const finisherLabel = displayUser(finisher as any)

    return (
      <div
        id={`task-${t._id}`}
        className="card"
        style={{ background: '#fafafa', cursor: 'pointer' }}
        onClick={() => nav(`/tasks/${t._id}`)}
        title="Ver detalle"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <h3
            className="card-title"
            style={{ textDecoration: 'line-through', color: '#666', marginBottom: 4 }}
          >
            {t.title}
          </h3>
          {t.priority && (
            <span
              className={`badge ${
                t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'amber' : 'green'
              }`}
            >
              Prioridad: {t.priority}
            </span>
          )}
        </div>

        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          Finalizada el {t.completedAt ? new Date(t.completedAt).toLocaleString() : '-'} por {finisherLabel}
        </div>

        <div className="btn-row mt-16">
          <button
            className="btn btn-outline"
            onClick={(e) => {
              e.stopPropagation()
              nav(`/tasks/${t._id}`)
            }}
          >
            Ver detalle
          </button>
        </div>
      </div>
    )
  }

  return (
    <Layout title="Tareas visibles para mí">
      {isLoading && <div className="card">Cargando…</div>}
      {isError && (
        <div className="card">
          Error.{' '}
          <button className="btn btn-ghost" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {/* --------- CALENDARIO SEMANAL --------- */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <strong>Calendario semanal</strong>
          <span className="muted" style={{ marginLeft: 8 }}>
            — rojo: importantes · amarillo: pendientes · gris: pasadas/finalizadas
          </span>
        </div>
        <div style={{ height: 600 }}>
          <Calendar
            localizer={localizer}
            culture="es"
            events={events}
            defaultView={Views.WEEK}
            views={[Views.WEEK, Views.DAY]}
            startAccessor="start"
            endAccessor="end"
            onSelectEvent={onSelectEvent}
            eventPropGetter={eventPropGetter}
            toolbar
            popup
            min={minTime}
            max={maxTime}
            step={30}
            timeslots={2}
            scrollToTime={scrollTo}
            messages={{
              week: 'Semana',
              day: 'Día',
              today: 'Hoy',
              previous: 'Anterior',
              next: 'Siguiente',
              allDay: 'Todo el día',
              noEventsInRange: 'No hay tareas en este rango',
              date: 'Fecha',
              time: 'Hora',
              event: 'Tarea',
            }}
          />
        </div>
      </div>

      {/* --------- MÉTRICAS --------- */}
      <div className="grid grid-3">
        {stats.map((s) => (
          <div key={s.title} className="card">
            <div className="card-sub">{s.title}</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* --------- SECCIÓN ABIERTAS (COLAPSABLE) --------- */}
      <SectionHeader
        title="Abiertas"
        count={abiertas.length}
        open={showOpen}
        onToggle={() => setShowOpen((v) => !v)}
      />
      {showOpen && (
        <>
          {!abiertas.length ? (
            <div className="card">No hay tareas.</div>
          ) : (
            abiertas.map((t) => <TaskCardOpen key={t._id} t={t} />)
          )}
        </>
      )}

      {/* --------- SECCIÓN FINALIZADAS (COLAPSABLE) --------- */}
      <SectionHeader
        title="Finalizadas"
        count={finalizadas.length}
        open={showDone}
        onToggle={() => setShowDone((v) => !v)}
      />
      {showDone && (
        <>
          {!finalizadas.length ? (
            <div className="card">No hay tareas finalizadas.</div>
          ) : (
            finalizadas.map((t) => <TaskCardDone key={t._id} t={t} />)
          )}
        </>
      )}
    </Layout>
  )
}
