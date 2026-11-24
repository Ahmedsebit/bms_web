import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { liveT as t } from './liveStrings'
import './App.css'
import './LiveDashboard.css'

type Row = Record<string, unknown>
type Session = {
  user: { id: string; name: string; role: string; mustChangePassword: boolean }
  interactiveCredential: { token: string }
}
type Snapshot = { school: Row; buildings: Row[]; emergency: Row }
type Editor = { command: string; target: Row; values: Row }
type Attention = { key: string; title: string; detail: string; priority: number; incident?: Row; action?: Editor }
const text = (row: Row, key: string) => typeof row[key] === 'string' ? row[key] as string : ''
const list = (value: unknown): Row[] => Array.isArray(value) ? value.filter(v => v && typeof v === 'object') : []
const command = () => ({ clientOperationId: crypto.randomUUID(), offline: false })
const staffName = (data: Row, id: string) => text(list(data.staff).find(s => text(s, 'id') === id) ?? {}, 'name') || t.noOwner
const active = (incident: Row) => ['active', 'recovery'].includes(text(incident, 'status'))
const briefFields = ['briefSituation', 'briefRisks', 'briefActions', 'briefCommunications']
const stateName = (incident: Row) => text(incident, 'status') === 'closed' ? t.completed :
  text(incident, 'status') === 'planned' ? t.next : text(incident, 'responseOwnerId') ? t.inProgress :
    text(incident, 'acknowledgedAt') ? t.awaitingAcceptance : t.awaitingReceipt
const count = (incident: Row, key: string) => Number((incident.accountability as Row | undefined)?.[key] ?? 0)

class RequestError extends Error {
  code: string
  status: number
  constructor(code: string, status: number) {
    super(t.errors[code] ?? t.error); this.code = code; this.status = status
  }
}
async function request<T>(path: string, token?: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const result = await fetch(path, {
    method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal,
  })
  const envelope = await result.json() as { data: T; error?: { code: string } }
  if (!result.ok) throw new RequestError(envelope.error?.code ?? 'BACKEND_UNAVAILABLE', result.status)
  return envelope.data
}

export function LiveDashboard() {
  const [session, setSession] = useState<Session | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const [school, setSchool] = useState('DEMO')
  const [user, setUser] = useState('LEADERSHIP')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [data, setData] = useState<Snapshot | null>(null)
  const [audit, setAudit] = useState<Row[]>([])
  const [current, setCurrent] = useState(false)
  const [observedAt, setObservedAt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [view, setView] = useState('home')
  const [bucket, setBucket] = useState('now')
  const [selected, setSelected] = useState<string | null>(null)
  const [section, setSection] = useState('summary')
  const [otherActions, setOtherActions] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [values, setValues] = useState<Row>({})
  const [note, setNote] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const dialog = useRef<HTMLDialogElement>(null)
  const errorSummary = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const operation = useRef(command())
  const token = session?.interactiveCredential.token
  const emergency = data?.emergency ?? {}
  const members = list(emergency.staff).filter(s => text(s, 'status') === 'active')
  const incidents = list(emergency.incidents)
  const date = (value: string) => {
    if (!value) return t.unknownTime
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium', timeStyle: 'short', timeZone: text(data?.school ?? {}, 'timezone') || 'UTC',
      }).format(Date.parse(value))
    } catch { return t.unknownTime }
  }
  const buildingName = (id: string) =>
    text(list(emergency.buildings).find(b => text(b, 'id') === id) ?? {}, 'name') || t.unknownState
  const recoveryFor = (id: string) => list(emergency.recovery).find(r => text(r, 'incidentId') === id)
  const incidentRows = (key: string, id: string) => list(emergency[key]).filter(r => text(r, 'incidentId') === id)

  function updateSession(next: Session | null) {
    sessionRef.current = next; setSession(next)
    setData(null); setAudit([]); setEditor(null); setCurrent(false)
    setSelected(null); setView('home'); setBucket('now'); setFieldErrors({})
  }
  function fail(reason: unknown) {
    setError(reason instanceof RequestError ? reason.message : t.error)
    if (reason instanceof RequestError && reason.status === 401) {
      updateSession(null); setPassword(''); setNewPassword('')
    }
  }
  useEffect(() => {
    if (!token || session?.user.mustChangePassword) return
    const controller = new AbortController()
    let pulling = false
    async function pull() {
      if (pulling) return
      pulling = true
      try {
        const fresh = await request<Snapshot>('/api/v1/leadership', token, undefined, controller.signal)
        const history = await request<{ items: Row[] }>('/api/v1/audit?limit=25', token, undefined, controller.signal)
        if (controller.signal.aborted) return
        setData(fresh); setAudit(history.items); setCurrent(true); setError('')
        setObservedAt(Date.parse(text(fresh.emergency, 'serverTime')) || Date.now())
      } catch (reason) {
        if (!controller.signal.aborted) { setCurrent(false); fail(reason) }
      } finally { pulling = false }
    }
    void pull()
    const timer = window.setInterval(() => void pull(), 30000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [token, session?.user.mustChangePassword, refresh])
  useEffect(() => { if (editor && !dialog.current?.open) dialog.current?.showModal() }, [editor])
  useEffect(() => { if (Object.keys(fieldErrors).length) errorSummary.current?.focus() }, [fieldErrors])

  function navigate(next: string, id: string | null = null) {
    setView(next); setSelected(id); setSection('summary'); setOtherActions(false)
    requestAnimationFrame(() => heading.current?.focus())
  }
  async function signIn(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const next = await request<Session>('/api/v1/auth/sign-in', undefined, {
        ...command(), schoolCode: school, userId: user, password, clientType: 'web',
      })
      updateSession(next)
      if (!next.user.mustChangePassword) setPassword('')
    } catch (reason) { fail(reason) } finally { setBusy(false) }
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const changed = await request<Session['user']>('/api/v1/auth/change-password', token, {
        ...command(), currentPassword: password, password: newPassword,
      })
      if (sessionRef.current === session && session) updateSession({ ...session, user: changed })
      setPassword(''); setNewPassword('')
    } catch (reason) { fail(reason) } finally { setBusy(false) }
  }
  async function signOut() {
    const previous = token
    updateSession(null); setPassword(''); setNewPassword(''); setNotice(''); setError('')
    if (previous) {
      try { await request('/api/v1/auth/sign-out', previous, command()) }
      catch { /* Local credentials are cleared even when revocation cannot be confirmed. */ }
    }
  }
  function open(name: string, target: Row, initial: Row = {}) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    operation.current = command()
    const stableTarget = text(target, 'id') ? target : { id: crypto.randomUUID(), revision: 0 }
    const stableValues = initial
    setEditor({ command: name, target: stableTarget, values: stableValues })
    setValues(stableValues); setNote(''); setFieldErrors({}); setError(''); setNotice('')
  }
  function closeEditor() {
    setEditor(null); setFieldErrors({})
    requestAnimationFrame(() => opener.current?.isConnected && opener.current.focus())
  }
  const incidentEditors: Record<string, string[]> = {
    'incident.responders': ['primaryUserId', 'backupUserId', 'leadUserId'],
    'incident.transfer': ['incomingUserId', ...briefFields],
    'recovery.save': ['accommodation', 'welfare', 'learningContinuity'],
    'recovery.approve': ['authorised'],
    'incident.contact': ['recipientUserId', 'channel', 'outcome'],
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!editor || !current || !token) return
    const structured = editor.command === 'incident.transfer'
    const brief = briefFields.map(key => `${t.fields[key]}:\n${text(values, key).trim()}`).join('\n\n')
    const errors: Record<string, string> = {}
    for (const key of incidentEditors[editor.command] ?? []) {
      if (key === 'authorised' ? values[key] !== true : !text(values, key).trim()) errors[key] = `${t.requiredField} ${t.fields[key]}`
    }
    if (!structured && editor.command !== 'recovery.save' && !note.trim()) errors.note = `${t.requiredField} ${t.note}`
    if (structured && brief.length > 2000) errors.briefSituation = t.briefTooLong
    if (!structured && note.length > 2000) errors.note = t.briefTooLong
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setBusy(true); setError('')
    const expectedSession = sessionRef.current
    const payload: Row = {
      ...operation.current, id: text(editor.target, 'id'),
      expectedRevision: editor.target.revision ?? 0, ...values, note: structured ? brief : note,
    }
    briefFields.forEach(key => delete payload[key])
    if (editor.command === 'recovery.save') delete payload.note
    if (editor.command === 'incident.contact') payload.expectedRevision = 0
    try {
      await request('/api/v1/emergency/commands', token, { command: editor.command, payload })
      if (sessionRef.current !== expectedSession) return
      closeEditor(); setNotice(t.saved); setCurrent(false); setRefresh(n => n + 1)
    } catch (reason) { if (sessionRef.current === expectedSession) fail(reason) }
    finally { setBusy(false) }
  }
  function blockers(incident: Row): string[] {
    const id = text(incident, 'id')
    const reasons: string[] = []
    if (count(incident, 'unaccounted') + count(incident, 'needs_assistance') > 0) reasons.push(t.errors.PEOPLE_UNACCOUNTED)
    if (['unaccounted', 'needs_assistance', 'at_assembly', 'confirmed_offsite', 'released'].reduce((n, key) => n + count(incident, key), 0) === 0)
      reasons.push(t.rosterEmpty)
    if (incidentRows('tasks', id).some(r => text(r, 'status') === 'open' || (r.safetyCritical === true && !text(r, 'verifiedAt'))))
      reasons.push(t.errors.EMERGENCY_TASKS_OPEN)
    if (incidentRows('transfers', id).some(r => text(r, 'status') === 'pending')) reasons.push(t.errors.TRANSFER_PENDING)
    if (incident.isDrill !== true) {
      if (!list(emergency.rosterReviews).some(r => text(r, 'buildingId') === text(incident, 'buildingId') && r.current === true))
        reasons.push(t.errors.ROSTER_RECONCILIATION_REQUIRED)
      if (data?.buildings.some(b => text(b, 'id') === text(incident, 'buildingId') && Number(b.highRisks) > 0))
        reasons.push(t.errors.UNRESOLVED_LIFE_SAFETY_FINDINGS)
    }
    return reasons
  }
  function actions(incident: Row): Editor[] {
    if (!session || !active(incident)) return []
    const id = text(incident, 'id')
    const result: Editor[] = []
    const add = (name: string, target: Row = incident, initial: Row = {}) =>
      result.push({ command: name, target, values: initial })
    const allocated = incidentRows('alerts', id).some(a => text(a, 'recipientId') === session.user.id &&
      a.notificationRound === incident.notificationRound && text(a, 'status') !== 'cancelled')
    const owner = text(incident, 'responseOwnerId') === session.user.id
    const lead = incident.canLead === true
    const recovery = recoveryFor(id)
    for (const transfer of incidentRows('transfers', id).filter(r => text(r, 'status') === 'pending')) {
      if (text(transfer, 'incomingUserId') === session.user.id) {
        add('incident.transfer_accept', transfer); add('incident.transfer_decline', transfer)
      }
      if (lead || text(transfer, 'requestedBy') === session.user.id) add('incident.transfer_cancel', transfer)
    }
    if (allocated && !text(incident, 'acknowledgedAt')) add('incident.acknowledge')
    if ((allocated || lead) && !text(incident, 'responseOwnerId')) add('incident.accept')
    if (owner) add('incident.progress')
    for (const task of incidentRows('tasks', id)) {
      if (incident.canVerify === true && text(task, 'status') === 'completed' &&
        !text(task, 'verifiedAt') && text(task, 'completedBy') !== session.user.id) {
        add('incident.task_verify', task); add('incident.task_reject', task)
      }
    }
    if (text(incident, 'status') === 'recovery' && recovery && incident.canApprove === true &&
      text(recovery, 'authoredBy') && text(recovery, 'authoredBy') !== session.user.id && !text(recovery, 'approvedAt'))
      add('recovery.approve', recovery)
    if (owner || lead) add('incident.transfer')
    if (lead && text(incident, 'status') === 'active') add('incident.responders', incident, {
      primaryUserId: text(incident, 'primaryUserId'), backupUserId: text(incident, 'backupUserId'),
      leadUserId: text(incident, 'leadUserId'),
    })
    if (incident.canAccount === true) add('incident.contact', {}, { incidentId: id })
    if (lead && incident.isDrill !== true) add('recovery.save', recovery ?? {}, {
      incidentId: id, accommodation: text(recovery ?? {}, 'accommodation'),
      welfare: text(recovery ?? {}, 'welfare'), learningContinuity: text(recovery ?? {}, 'learningContinuity'),
    })
    if (lead) add('incident.phase', incident, { status: text(incident, 'status') === 'active' ? 'recovery' : 'closed' })
    const priority: Record<string, number> = {
      'incident.transfer_accept': 0, 'incident.acknowledge': 1, 'incident.accept': 2,
      'incident.progress': 3, 'incident.task_verify': 4, 'recovery.approve': 5,
      'incident.transfer_decline': 20, 'incident.transfer_cancel': 20, 'incident.task_reject': 20,
    }
    const actionPriority = (action: Editor) =>
      action.command === 'incident.task_verify' && action.target.safetyCritical !== true
        ? 10 : priority[action.command] ?? 10
    return result.sort((a, b) => actionPriority(a) - actionPriority(b))
  }
  const attention: Attention[] = incidents.filter(active).map(incident => {
    const id = text(incident, 'id')
    const available = actions(incident)
    const primary = available[0]
    const stalled = text(incident, 'progressDeadline') && Date.parse(text(incident, 'progressDeadline')) <= observedAt
    const urgent = incident.isDrill !== true && (!text(incident, 'responseOwnerId') ||
      count(incident, 'unaccounted') + count(incident, 'needs_assistance') > 0 || stalled)
    return { key: id, title: text(incident, 'title'), detail: buildingName(text(incident, 'buildingId')),
      priority: urgent ? 0 : 2, incident, action: primary }
  })
  list(emergency.coverage).forEach((gap, index) => attention.push({
    key: `coverage:${index}`, title: buildingName(text(gap, 'buildingId')),
    detail: `${text(gap, 'kind').replaceAll('_', ' ')} · ${date(text(gap, 'startsAt'))}`,
    priority: Date.parse(text(gap, 'startsAt')) > observedAt ? 20 : 5,
  }))
  list(emergency.rosterReviews).filter(r => r.current !== true).forEach(r => attention.push({
    key: `roster:${text(r, 'buildingId')}`, title: buildingName(text(r, 'buildingId')),
    detail: t.errors.ROSTER_RECONCILIATION_REQUIRED, priority: 5,
  }))
  if (session?.user.role === 'administrator') list(emergency.grants).filter(g => g.active === true &&
    Date.parse(text(g, 'endsAt')) <= observedAt + 86400000).forEach(g => attention.push({
    key: `grant:${text(g, 'id')}`, title: staffName(emergency, text(g, 'userId')),
    detail: `${text(g, 'capability')} · ${t.grantExpiry} ${date(text(g, 'endsAt'))}`, priority: 5,
  }))
  attention.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key))
  const urgentItems = attention.filter(a => a.priority < 10)
  const visible = attention.filter(a => bucket === 'decisions' ? !!a.action : bucket === 'next' ? a.priority >= 10 : a.priority < 10)
  const chosen = incidents.find(i => text(i, 'id') === selected)
  const renderAction = (action: Editor, incident: Row, primary = false) => <button
    key={`${action.command}:${text(action.target, 'id')}`}
    className={`button ${primary ? 'primary' : 'secondary'}`}
    disabled={!current || busy || (action.command === 'recovery.approve' && blockers(incident).length > 0)}
    onClick={() => open(action.command, action.target, action.command === 'incident.contact'
      ? { ...action.values, occurredAt: new Date().toISOString() } : action.values)}>{t.commands[action.command]}</button>
  const incidentSummary = (incident: Row) => <>
    <p>{stateName(incident)} · {text(incident, 'hazard')}</p>
    <p>{t.owner}: {staffName(emergency, text(incident, 'responseOwnerId'))}</p>
    <p>{t.accountability}: {t.unknown} {count(incident, 'unaccounted')} · {t.assistance} {count(incident, 'needs_assistance')}</p>
    <p>{t.nextDeadline}: {date(text(incident, 'progressDeadline') ||
      incidentRows('alerts', text(incident, 'id')).filter(a => a.notificationRound === incident.notificationRound &&
        !['cancelled', 'failed', 'escalated'].includes(text(a, 'status')))
        .sort((a, b) => Date.parse(text(a, 'deadline')) - Date.parse(text(b, 'deadline')))[0]?.deadline as string || '')}</p>
  </>
  const ready = session && !session.user.mustChangePassword

  return <div className="live-shell">
    <header className="live-header"><img src="/wallinde-lockup-dark.png" alt="Wallinde" />
      <a href="/">{t.demo}</a>
      {session && <button className="button secondary" onClick={() => void signOut()}>{t.signOut}</button>}
    </header>
    {ready && urgentItems.length > 0 && <aside className="live-attention-banner" aria-label={t.inbox}>
      <strong>{t.inbox} ({urgentItems.length})</strong>
      <button onClick={() => urgentItems[0].incident
        ? navigate('incidents', text(urgentItems[0].incident, 'id')) : navigate('duty')}>
        {urgentItems[0].title} — {urgentItems[0].incident ? t.openIncident : t.viewDuty}
      </button>
    </aside>}
    <main className="live-main">
      <h1 ref={heading} tabIndex={-1}>{t.title}</h1>
      <p className="live-warning">{t.warning}</p>
      {!session ? <form className="live-login panel" onSubmit={event => void signIn(event)}>
        <h2>{t.login}</h2>
        <label>{t.school}<input required autoComplete="organization" value={school} onChange={e => setSchool(e.target.value)} /></label>
        <label>{t.user}<input required autoComplete="username" value={user} onChange={e => setUser(e.target.value)} /></label>
        <label>{t.password}<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button className="button primary" disabled={busy}>{busy ? t.working : t.signIn}</button><p>{t.privacy}</p>
      </form> : session.user.mustChangePassword ? <form className="live-login panel" onSubmit={event => void changePassword(event)}>
        <h2>{t.changePassword}</h2><p>{t.passwordNote}</p>
        <label>{t.newPassword}<input required minLength={15} maxLength={128} type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label>
        <button className="button primary" disabled={busy}>{t.changePassword}</button>
      </form> : <>
        <div className="live-toolbar"><strong>{text(data?.school ?? {}, 'name')} · {session.user.name} · {session.user.role}</strong>
          <button className="button secondary" disabled={busy} onClick={() => { setCurrent(false); setRefresh(n => n + 1) }}>{t.refresh}</button>
        </div>
        <p>{t.roleAuthority} {t.readOnly}</p>
        <p>{t.current}: {date(text(emergency, 'serverTime'))}</p>
        {!current && <p role="status" className="live-warning">{t.unavailable}</p>}
        <p className="sr-only" role="status">{t.attentionUpdated}: {urgentItems.length}</p>
        <nav className="live-nav" aria-label={t.title}>
          {[['home', t.home], ['incidents', t.incidents], ['duty', t.duty], ['audit', t.audit]].map(([key, title]) =>
            <button key={key} aria-current={view === key ? 'page' : undefined} onClick={() => navigate(key)}>{title}</button>)}
        </nav>
        {view === 'home' && <>
          <h2>{session.user.role === 'administrator' ? t.administratorHome : session.user.role === 'supervisor' ? t.supervisorHome : t.leadershipHome}</h2>
          <div className="live-toolbar">
            {[['now', t.now], ['next', t.next], ['decisions', t.decisions], ['completed', t.completed]].map(([key, title]) =>
              <button key={key} aria-pressed={bucket === key} onClick={() => setBucket(key)}>{title}</button>)}
          </div>
          {bucket === 'completed' ? <>
            <p>{t.completedGuidance}</p>
            {incidents.filter(i => text(i, 'status') === 'closed').map(i => <article className="live-incident panel" key={text(i, 'id')}>
              <h3>{text(i, 'title')}</h3><p>{t.completed}</p>
              <button className="button secondary" onClick={() => navigate('incidents', text(i, 'id'))}>{t.openIncident}</button>
            </article>)}
          </> : visible.length === 0 ? <p>{t.noAttention}</p> : visible.map(item => <article className="live-incident panel" key={item.key}>
            <h3>{item.title}</h3><p>{item.detail}</p>
            {item.incident && incidentSummary(item.incident)}
            <div className="live-actions">
              {item.incident && item.action && renderAction(item.action, item.incident, true)}
              <button className="button secondary" onClick={() => item.incident
                ? navigate('incidents', text(item.incident, 'id')) : navigate('duty')}>{item.incident ? t.openIncident : t.viewDuty}</button>
            </div>
            {item.action?.command === 'recovery.approve' && item.incident && blockers(item.incident).length > 0 &&
              <p className="live-warning">{blockers(item.incident).join(' ')}</p>}
          </article>)}
          <h2>{t.buildings}</h2>
          <div className="live-grid">{[...(data?.buildings ?? [])].sort((a, b) => Number(b.highRisks) - Number(a.highRisks) || text(a, 'id').localeCompare(text(b, 'id'))).map(building =>
            <article className="metric-card metric-red" key={text(building, 'id')}>
              <h3>{text(building, 'name')}</h3><p>{t.risks}: {Number(building.highRisks ?? 0)}</p>
              <p>{t.findings}: {Number(building.openFindings ?? 0)}</p>
            </article>)}</div>
        </>}
        {view === 'incidents' && !chosen && <>
          <h2>{t.incidents}</h2>
          {!incidents.length && <p>{t.none}</p>}
          {[...incidents].sort((a, b) => Number(active(b)) - Number(active(a)) || text(a, 'id').localeCompare(text(b, 'id'))).map(i =>
            <article className="live-incident panel" key={text(i, 'id')}><h3>{text(i, 'title')}</h3>
              {incidentSummary(i)}<button className="button secondary" onClick={() => navigate('incidents', text(i, 'id'))}>{t.openIncident}</button>
            </article>)}
        </>}
        {view === 'incidents' && chosen && <article className="live-incident panel">
          <button className="button secondary" onClick={() => navigate('incidents')}>{t.back}</button>
          <h2>{text(chosen, 'title')}</h2><p>{buildingName(text(chosen, 'buildingId'))}</p>
          {incidentSummary(chosen)}
          <p>{t.backup}: {staffName(emergency, text(chosen, 'backupUserId'))}</p>
          <p>{t.lead}: {staffName(emergency, text(chosen, 'leadUserId'))}</p>
          <nav className="live-nav" aria-label={t.openIncident}>
            {[['summary', t.summary], ['people', t.people], ['actions', t.actions], ['timeline', t.timeline]].map(([key, title]) =>
              <button key={key} aria-pressed={section === key} onClick={() => { setSection(key); setOtherActions(false) }}>{title}</button>)}
          </nav>
          {section === 'summary' && <>
            {blockers(chosen).length > 0 && <section><h3>{t.blockers}</h3>{blockers(chosen).map(message =>
              <p key={message} className="live-warning">{message}</p>)}</section>}
            {incidentRows('alerts', text(chosen, 'id')).filter(a => ['failed', 'escalated'].includes(text(a, 'status')) &&
              a.notificationRound === chosen.notificationRound).map(a =>
                <p className="live-warning" key={text(a, 'id')}>{text(a, 'failureReason')}</p>)}
            <div className="live-actions">
              {actions(chosen)[0] && renderAction(actions(chosen)[0], chosen, true)}
              {actions(chosen).length > 1 && <button className="button secondary" onClick={() => setSection('actions')}>{t.otherActions}</button>}
            </div>
          </>}
          {section === 'people' && <>
            {count(chosen, 'unaccounted') + count(chosen, 'needs_assistance') === 0 &&
              ['at_assembly', 'confirmed_offsite', 'released'].some(key => count(chosen, key) > 0) &&
              <p>{t.accountabilityConfirmed}</p>}
            {incidentRows('rollCall', text(chosen, 'id')).length ? incidentRows('rollCall', text(chosen, 'id'))
              .sort((a, b) => Number(['unaccounted', 'needs_assistance'].includes(text(b, 'status'))) -
                Number(['unaccounted', 'needs_assistance'].includes(text(a, 'status')))).map(person =>
                  <section key={text(person, 'id')}><h3>{text(person, 'personName')}</h3>
                    <p>{text(person, 'status').replaceAll('_', ' ')}</p><p>{text(person, 'assistance')}</p>
                    <p>{t.current}: {date(text(person, 'lastConfirmedAt'))}</p>
                  </section>) : <p>{t.privatePeople}</p>}
          </>}
          {section === 'actions' && <>
            <div className="live-actions">
              {actions(chosen)[0] && renderAction(actions(chosen)[0], chosen, true)}
              {actions(chosen).length > 1 && <button className="button secondary" aria-expanded={otherActions}
                onClick={() => setOtherActions(v => !v)}>{t.otherActions}</button>}
              {otherActions && actions(chosen).slice(1).map(action => renderAction(action, chosen))}
            </div>
            {incidentRows('tasks', text(chosen, 'id')).map(task => <section key={text(task, 'id')}>
              <h3>{text(task, 'title')}</h3><p>{task.safetyCritical === true && text(task, 'status') === 'completed' &&
                !text(task, 'verifiedAt') ? t.awaitingVerification : text(task, 'status')}</p>
              <p>{staffName(emergency, text(task, 'ownerId'))} · {date(text(task, 'dueAt'))}</p><p>{text(task, 'observation')}</p>
            </section>)}
            {recoveryFor(text(chosen, 'id')) && <section>
              <h3>{t.commands['recovery.save']}</h3>
              {['accommodation', 'welfare', 'learningContinuity'].map(key => <p key={key}>
                {t.fields[key]}: {text(recoveryFor(text(chosen, 'id')) ?? {}, key)}</p>)}
              {text(recoveryFor(text(chosen, 'id')) ?? {}, 'approvedAt') ? <p>{t.approvalRecorded}</p> :
                text(recoveryFor(text(chosen, 'id')) ?? {}, 'authoredBy') === session.user.id && <p>{t.selfApproval}</p>}
            </section>}
          </>}
          {section === 'timeline' && ['progress', 'contactAttempts', 'transfers', 'alerts'].flatMap(kind =>
            incidentRows(kind, text(chosen, 'id')).map(row => ({ kind, row })))
            .sort((a, b) => (Date.parse(text(b.row, 'occurredAt') || text(b.row, 'updatedAt') || text(b.row, 'createdAt')) || 0) -
              (Date.parse(text(a.row, 'occurredAt') || text(a.row, 'updatedAt') || text(a.row, 'createdAt')) || 0))
            .map(({ kind, row }) => <section key={`${kind}:${text(row, 'id')}`}>
              <h3>{kind === 'progress' ? t.commands['incident.progress'] : kind === 'contactAttempts' ?
                t.commands['incident.contact'] : kind === 'transfers' ? t.commands['incident.transfer'] : t.responseNotifications}</h3>
              <p>{date(text(row, 'occurredAt') || text(row, 'updatedAt') || text(row, 'createdAt'))}
                {' · '}{text(row, 'status') || text(row, 'outcome')}</p>
              <p className="live-brief">{text(row, 'note') || text(row, 'failureReason')}</p>
            </section>)}
        </article>}
        {view === 'duty' && <>
          <h2>{t.gaps}</h2>
          {list(emergency.coverage).map((gap, i) => <p key={i} className="live-warning">
            {buildingName(text(gap, 'buildingId'))} · {text(gap, 'kind').replaceAll('_', ' ')} {date(text(gap, 'startsAt'))} {date(text(gap, 'endsAt'))}
          </p>)}
          {list(emergency.shifts).filter(s => Date.parse(text(s, 'endsAt')) > observedAt &&
            Date.parse(text(s, 'startsAt')) < observedAt + 86400000).map(shift => <article key={text(shift, 'id')} className="live-incident panel">
              <h3>{buildingName(text(shift, 'buildingId'))}</h3><p>{date(text(shift, 'startsAt'))} — {date(text(shift, 'endsAt'))}</p>
              <p>{staffName(emergency, text(shift, 'primaryUserId'))} · {t.backup}: {staffName(emergency, text(shift, 'backupUserId'))}</p>
              <p>{text(shift, 'primaryAcceptedAt') && text(shift, 'backupAcceptedAt') ? t.availabilityConfirmed : t.availabilityNeeded}</p>
            </article>)}
          {list(emergency.rosterReviews).map(review => <p key={text(review, 'buildingId')}>
            {buildingName(text(review, 'buildingId'))} · {review.current ? t.rosterCurrent : t.errors.ROSTER_RECONCILIATION_REQUIRED}
          </p>)}
          {list(emergency.handovers).map(h => <section key={text(h, 'id')}><h3>{text(h, 'acceptedAt') ? t.completed : t.awaitingAcceptance}</h3>
            <p className="live-brief">{text(h, 'note')}</p></section>)}
        </>}
        {view === 'audit' && <><h2>{t.audit}</h2>{audit.map(row =>
          <p key={text(row, 'id')}>{date(text(row, 'receivedAt'))} · {text(row, 'action')}</p>)}</>}
      </>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert" className="live-warning">{error}</p>}
    </main>
    {editor && <dialog ref={dialog} className="modal live-dialog" aria-label={t.commands[editor.command]}
      onCancel={event => { if (busy) event.preventDefault(); else closeEditor() }}
      onClose={() => { if (!busy && editor) closeEditor() }}>
      <form noValidate onSubmit={event => void submit(event)}>
        <h2>{t.commands[editor.command]}</h2>
        {editor.command === 'incident.contact' && <p>{t.contactWarning}</p>}
        {editor.command === 'incident.transfer' && <p>{t.briefGuidance}</p>}
        {Object.keys(fieldErrors).length > 0 && <div ref={errorSummary} tabIndex={-1} role="alert" className="live-warning">
          <h3>{t.formErrors}</h3>
          {Object.entries(fieldErrors).map(([key, message]) => <p key={key}><a href={`#live-field-${key}`}
            onClick={event => { event.preventDefault(); document.getElementById(`live-field-${key}`)?.focus() }}>{message}</a></p>)}
        </div>}
        {(incidentEditors[editor.command] ?? []).map(key => {
          const options = key.endsWith('Id') ? members
            .filter(s => key === 'leadUserId' ? ['supervisor', 'administrator', 'leadership'].includes(text(s, 'role')) :
              key === 'incomingUserId' ? text(s, 'id') !== text(editor.target, 'responseOwnerId') :
                ['primaryUserId', 'backupUserId'].includes(key) ? ['officer', 'supervisor'].includes(text(s, 'role')) : true)
            .map(s => [text(s, 'id'), text(s, 'name')]) :
              key === 'channel' ? ['phone', 'radio', 'in_person'].map(v => [v, v.replaceAll('_', ' ')]) :
                key === 'outcome' ? ['attempted', 'reached', 'failed', 'no_response'].map(v => [v, v.replaceAll('_', ' ')]) : null
          const properties = { id: `live-field-${key}`, 'aria-invalid': !!fieldErrors[key],
            'aria-describedby': fieldErrors[key] ? `live-error-${key}` : undefined }
          return <div key={key}><label htmlFor={`live-field-${key}`}>{t.fields[key]}</label>
            {key === 'authorised' ? <input {...properties} type="checkbox" checked={values[key] === true}
              onChange={e => setValues(v => ({ ...v, [key]: e.target.checked }))} /> : options ?
              <select {...properties} value={text(values, key)} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}>
                <option value="">—</option>{options.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
              </select> : <textarea {...properties} value={text(values, key)} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} />}
            {fieldErrors[key] && <p id={`live-error-${key}`} className="live-field-error">{fieldErrors[key]}</p>}
          </div>
        })}
        {!['recovery.save', 'incident.transfer'].includes(editor.command) && <div><label htmlFor="live-field-note">{t.note}</label>
          <textarea id="live-field-note" aria-invalid={!!fieldErrors.note} aria-describedby={fieldErrors.note ? 'live-error-note' : undefined}
            value={note} onChange={e => setNote(e.target.value)} />
          {fieldErrors.note && <p id="live-error-note" className="live-field-error">{fieldErrors.note}</p>}
        </div>}
        {error && <p role="alert">{error}</p>}
        <div className="live-actions"><button className="button primary" disabled={busy || !current}>{t.save}</button>
          <button type="button" className="button secondary" disabled={busy} onClick={closeEditor}>{t.cancel}</button></div>
      </form>
    </dialog>}
  </div>
}
