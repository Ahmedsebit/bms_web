import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  ArrowRight, ArrowUpRight, BadgeCheck, Building2, CalendarDays, Camera,
  Check, CheckCheck, ChevronRight, CircleAlert, CircleCheck, ClipboardList,
  Clock3, FlaskConical, LayoutDashboard, MapPin, Menu, Plus, RefreshCw,
  Search, ShieldCheck, SlidersHorizontal, TriangleAlert, UsersRound, X,
} from 'lucide-react'
import {
  CURRENT_USER, SAMPLE_DAY, dormHeadline, dormName, dormitories, headlineLabels,
  initialFindings, isOpen, isOverdue, ownerName, people, severityLabels,
  checkSummary, remainingChecks, remainingCheckSummary,
  sortDormitories, sortFindings, statusLabels,
} from './data'
import type { Dormitory, Finding, Headline, Page, Severity } from './data'
import { t } from './strings'
import { EmergencyDashboard } from './EmergencyDashboard'
import './App.css'

const pageIcons = {
  overview: LayoutDashboard, dormitories: Building2,
  findings: ClipboardList, verification: BadgeCheck,
  emergency: TriangleAlert,
}
const pages: Page[] = ['overview', 'dormitories', 'findings', 'verification', 'emergency']
const shortDate = (date: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi',
}).format(new Date(date.length === 10 ? `${date}T12:00:00+03:00` : date))

function HeadlineBadge({ state }: { state: Headline }) {
  const Icon = state === 'current' ? CircleCheck : state === 'incomplete' ? CircleAlert : TriangleAlert
  return <span className={`headline-badge ${state}`}><Icon size={13} aria-hidden />{headlineLabels[state]}</span>
}

function Modal({ title, children, onClose, wide = false }: {
  title: string; children: ReactNode; onClose: () => void; wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (!ref.current?.open) ref.current?.showModal() }, [])
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} aria-label={title}
    onKeyDown={event => {
      if (event.key !== 'Tab') return
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
      )).filter(control => control.getClientRects().length > 0)
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus()
      }
    }}
    onClose={onClose} onClick={event => { if (event.target === event.currentTarget) ref.current?.close() }}>
    <header className="modal-header"><h2>{title}</h2>
      <button className="icon-button" aria-label={t.close} onClick={() => ref.current?.close()}><X size={20} /></button>
    </header>
    {children}
  </dialog>
}

function FindingDialog({ finding, onClose, onUpdate }: {
  finding: Finding; onClose: () => void; onUpdate: (finding: Finding, message: string) => void
}) {
  const [ownerId, setOwnerId] = useState('')
  const [actionTitle, setActionTitle] = useState('')
  const [dueDate, setDueDate] = useState(SAMPLE_DAY)
  const [note, setNote] = useState('')
  const [evidence, setEvidence] = useState(false)
  const selfCompletion = finding.action?.completedBy === CURRENT_USER
  const needsEvidence = finding.severity === 'critical' || finding.severity === 'high'
  const form = useRef<HTMLFormElement>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (finding.status === 'open' && ownerId && actionTitle.trim()) {
      onUpdate({ ...finding, status: 'action_required',
        action: { title: actionTitle.trim(), ownerId, dueDate } }, t.assignSuccess)
    } else if (finding.status === 'action_required' && finding.action?.ownerId === CURRENT_USER) {
      if (!note.trim() || (needsEvidence && !evidence)) return
      onUpdate({ ...finding, status: 'awaiting_verification',
        action: { ...finding.action, completedBy: CURRENT_USER, completionNote: note.trim(), evidence } },
      t.completeSuccess)
    } else if (finding.status === 'awaiting_verification' && finding.action && !selfCompletion) {
      if (!note.trim()) return
      const decision = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
      if (decision?.value === 'reject') {
        onUpdate({ ...finding, status: 'action_required', action: {
          ...finding.action, completedBy: undefined, completionNote: undefined, evidence: undefined,
          rejectionNote: note.trim(),
        } }, t.rejected)
      } else if (!needsEvidence || finding.action.evidence) {
        onUpdate({ ...finding, status: 'verified_closed', action: {
          ...finding.action, verifiedBy: CURRENT_USER, verificationNote: note.trim(),
        } }, t.verified)
      }
    }
  }

  return <Modal title={finding.id} onClose={onClose}>
    <div className="finding-summary">
      <div className="inline-meta"><span className={`severity ${finding.severity}`}>{severityLabels[finding.severity]}</span>
        <span className={`status ${finding.status}`}>{statusLabels[finding.status]}</span></div>
      <h3>{finding.title}</h3>
      <p className="location"><MapPin size={15} aria-hidden />{dormName(finding.dormId)} · {finding.location}</p>
      <p>{finding.description}</p>
      <small>{t.reported} {shortDate(finding.reportedAt)}</small>
    </div>
    {finding.action && <section className="detail-section">
      <h4>{t.actionTitle}</h4><p>{finding.action.title}</p>
      <div className="detail-pair"><span>{ownerName(finding.action.ownerId)}</span>
        <span>{t.due}: {shortDate(finding.action.dueDate)}</span></div>
      {finding.action.rejectionNote && <div className="notice warning"><strong>{t.reject}</strong><p>{finding.action.rejectionNote}</p></div>}
      {finding.action.completionNote && <>
        <h4>{t.completion}</h4><p>{finding.action.completionNote}</p>
        <small>{t.completedBy}: {ownerName(finding.action.completedBy)}</small>
        <div className="evidence-placeholder"><Camera size={24} aria-hidden /><div>
          <strong>{t.evidence}</strong><p>{finding.action.evidence ? t.evidenceNote : t.evidencePendingNote}</p>
        </div></div>
      </>}
    </section>}
    {finding.status === 'verified_closed' ? <section className="detail-section">
      <div className="notice success"><CircleCheck size={20} aria-hidden /><p>{t.verifiedNote}</p></div>
      <h4>{t.verificationNote}</h4><p>{finding.action?.verificationNote}</p>
      <small>{t.verifiedBy}: {ownerName(finding.action?.verifiedBy)}</small>
    </section> : selfCompletion && finding.status === 'awaiting_verification' ?
      <div className="detail-section"><div className="notice warning"><ShieldCheck size={22} aria-hidden /><p>{t.selfVerification}</p></div></div> :
      finding.status === 'action_required' && finding.action?.ownerId !== CURRENT_USER ?
        <div className="detail-section"><p className="muted">{t.ownerOnly}</p></div> :
        <form ref={form} onSubmit={submit} className="action-form">
          {finding.status === 'open' ? <>
            <h4>{t.assignmentTitle}</h4>
            <label>{t.actionTitle}<textarea required value={actionTitle} onChange={e => setActionTitle(e.target.value)}
              placeholder={t.actionPlaceholder} maxLength={1000} rows={3} /></label>
            <div className="form-grid"><label>{t.owner}<select required value={ownerId} onChange={e => setOwnerId(e.target.value)}>
              <option value="">{t.chooseOwner}</option>
              {people.map(person => <option value={person.id} key={person.id}>{person.name}</option>)}
            </select></label>
            <label>{t.due}<input required type="date" min={SAMPLE_DAY} value={dueDate}
              onChange={e => setDueDate(e.target.value)} /></label></div>
            <button className="button primary" type="submit">{t.assign}<ArrowRight size={16} aria-hidden /></button>
          </> : <>
            <h4>{finding.status === 'awaiting_verification' ? t.independentTitle : t.yourAction}</h4>
            <p className="muted">{finding.status === 'awaiting_verification' ? t.independentNote : t.completeNote}</p>
            <label>{t.note}<textarea required value={note} onChange={e => setNote(e.target.value)}
              placeholder={t.notePlaceholder} rows={3} maxLength={2000} /></label>
            {finding.status === 'action_required' && <label className="checkbox-label">
              <input type="checkbox" required={needsEvidence} checked={evidence} onChange={e => setEvidence(e.target.checked)} />
              {t.attachEvidence}</label>}
            <div className="form-actions">
              {finding.status === 'awaiting_verification' ? <>
                <button className="button secondary" type="submit" value="reject">{t.reject}</button>
                <button className="button primary" type="submit" value="verify"
                  disabled={needsEvidence && !finding.action?.evidence}><CheckCheck size={17} aria-hidden />{t.verify}</button>
              </> : <button className="button primary" type="submit">{t.complete}<Check size={17} aria-hidden /></button>}
            </div>
          </>}
        </form>}
  </Modal>
}

function NewFindingDialog({ onClose, onCreate }: {
  onClose: () => void; onCreate: (finding: Omit<Finding, 'id'>) => void
}) {
  const [dormId, setDormId] = useState(dormitories[0].id)
  const [severity, setSeverity] = useState<Severity>('medium')
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState(false)
  return <Modal title={t.newFinding} onClose={onClose}>
    <form className="action-form" onSubmit={event => {
      event.preventDefault()
      if (!title.trim() || !location.trim() || !description.trim() || !photo) return
      onCreate({ dormId, title: title.trim(), location: location.trim(), description: description.trim(),
        severity, status: 'open', reportedAt: `${SAMPLE_DAY}T10:00:00+03:00` })
    }}>
      <div className="notice warning"><FlaskConical size={20} aria-hidden /><p>{t.newFindingNote}</p></div>
      <div className="form-grid"><label>{t.dormitory}<select value={dormId} onChange={e => setDormId(e.target.value)}>
        {dormitories.map(dorm => <option value={dorm.id} key={dorm.id}>{dorm.name}</option>)}
      </select></label>
      <label>{t.severity}<select value={severity} onChange={e => setSeverity(e.target.value as Severity)}>
        {Object.entries(severityLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
      </select></label></div>
      <label>{t.findingName}<input required value={title} onChange={e => setTitle(e.target.value)} maxLength={160} /></label>
      <label>{t.location}<input required value={location} onChange={e => setLocation(e.target.value)} maxLength={160} /></label>
      <label>{t.description}<textarea required value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={2000} /></label>
      <label className="checkbox-label"><input required type="checkbox" checked={photo} onChange={e => setPhoto(e.target.checked)} />{t.requiredPhoto}</label>
      <button type="submit" className="button primary"><Plus size={17} aria-hidden />{t.report}</button>
    </form>
  </Modal>
}

function App() {
  const [page, setPage] = useState<Page>('overview')
  const [findings, setFindings] = useState<Finding[]>(() => structuredClone(initialFindings))
  const [dormFilter, setDormFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [onlyMissed, setOnlyMissed] = useState(false)
  const [onlyMine, setOnlyMine] = useState(false)
  const [onlyOverdue, setOnlyOverdue] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDorm, setSelectedDorm] = useState<Dormitory | null>(null)
  const [newFinding, setNewFinding] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [toast, setToast] = useState('')
  const [emergencyReset, setEmergencyReset] = useState(0)
  const selected = findings.find(finding => finding.id === selectedId)
  const scoped = findings.filter(finding => dormFilter === 'all' || finding.dormId === dormFilter)
  const scopedDorms = dormitories.filter(dorm => dormFilter === 'all' || dorm.id === dormFilter)
  const unresolved = scoped.filter(isOpen)
  const awaiting = scoped.filter(finding => finding.status === 'awaiting_verification')
  const unassigned = unresolved.filter(finding => !finding.action)
  const missed = scopedDorms.reduce((sum, dorm) => sum + dorm.missed, 0)
  const critical = unresolved.filter(finding => finding.severity === 'critical')
  const overdue = unresolved.filter(isOverdue)
  const myActions = unresolved.filter(finding =>
    finding.status === 'action_required' && finding.action?.ownerId === CURRENT_USER)
  const visibleFindings = sortFindings(scoped.filter(finding => {
    const filter = page === 'overview' ? isOpen(finding) : page === 'verification' ?
      finding.status === 'awaiting_verification' : statusFilter === 'all' ||
      (statusFilter === 'active' ? isOpen(finding) : finding.status === statusFilter)
    const query = `${finding.id} ${finding.title} ${finding.location} ${dormName(finding.dormId)}`.toLowerCase()
    return filter && (!onlyMine || finding.action?.ownerId === CURRENT_USER) &&
      (!onlyOverdue || isOverdue(finding)) &&
      (severityFilter === 'all' || finding.severity === severityFilter) &&
      query.includes(search.toLowerCase().trim())
  }))
  const sortedDorms = sortDormitories(findings).filter(dorm =>
    (dormFilter === 'all' || dorm.id === dormFilter) && (!onlyMissed || dorm.missed > 0))
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 6000)
    return () => window.clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 801px)')
    const resetNavigation = () => { if (desktop.matches) setMobileNav(false) }
    desktop.addEventListener('change', resetNavigation)
    return () => desktop.removeEventListener('change', resetNavigation)
  }, [])

  function navigate(next: Page, status = 'active') {
    setPage(next); setStatusFilter(status); setSearch(''); setSeverityFilter('all')
    setOnlyMissed(false); setOnlyMine(false); setOnlyOverdue(false); setMobileNav(false)
  }
  function clearFilters() {
    setDormFilter('all'); setStatusFilter('active'); setSeverityFilter('all'); setSearch('')
    setOnlyMissed(false); setOnlyMine(false); setOnlyOverdue(false)
  }
  function updateFinding(finding: Finding, message: string) {
    setFindings(current => current.map(item => item.id === finding.id ? finding : item))
    setSelectedId(null); setToast(message)
  }
  function openDormFindings(id: string) {
    navigate('findings'); setDormFilter(id); setSelectedDorm(null)
  }

  const findingTable = <div className="table-scroll"><table className="findings-table">
    <thead><tr><th>{t.finding}</th><th>{t.severity}</th><th>{t.owner}</th><th>{t.status}</th><th className="row-action-heading">{t.actions}</th></tr></thead>
    <tbody>{(page === 'overview' ? visibleFindings.slice(0, 4) : visibleFindings).map(finding => <tr key={finding.id}
      className={`finding-row severity-${finding.severity}`} onClick={event => {
        if (!(event.target as Element).closest('button')) setSelectedId(finding.id)
      }}>
      <td><div className="finding-identity"><span className="finding-symbol">
        {finding.severity === 'critical' || finding.severity === 'high'
          ? <TriangleAlert size={19} aria-hidden /> : <ClipboardList size={19} aria-hidden />}
        </span><div><button className="finding-title" onClick={() => setSelectedId(finding.id)}>{finding.title}</button>
        <span className="table-subtitle">{finding.id} <span>·</span> {dormName(finding.dormId)}</span>
        <span className="record-location">{finding.location}</span></div></div></td>
      <td data-label={t.severity}><span className={`severity ${finding.severity}`}>{severityLabels[finding.severity]}</span></td>
      <td data-label={t.owner}>{finding.action ? <span className="owner"><span className="avatar small">{people.find(p => p.id === finding.action?.ownerId)?.initials}</span>
        {ownerName(finding.action.ownerId)}</span> : <span className="unassigned"><span className="empty-avatar">?</span>{t.unassigned}</span>}</td>
      <td data-label={t.status}><span className={`status ${finding.status}`}>{statusLabels[finding.status]}</span>
        {finding.action && <span className="table-subtitle">{t.due}: {shortDate(finding.action.dueDate)}</span>}
        {isOverdue(finding) && <span className="overdue"><Clock3 size={11} aria-hidden />{t.overdue} · {shortDate(finding.action!.dueDate)}</span>}</td>
      <td className="record-action"><button className="icon-button" onClick={() => setSelectedId(finding.id)} aria-label={`${t.viewDetails}: ${finding.title}`}><ArrowUpRight size={18} /></button></td>
    </tr>)}</tbody>
  </table>{visibleFindings.length === 0 && <div className="empty-state"><CircleCheck size={32} aria-hidden />
    <h3>{page === 'verification' && !search && dormFilter === 'all' ? t.noVerification : t.noResults}</h3>
    <p>{t.noResultsNote}</p><button className="text-button" onClick={clearFilters}>{t.clearFilters}<ArrowRight size={15} aria-hidden /></button>
  </div>}</div>

  const dormTable = <div className="table-scroll"><table className="dorm-table">
    <thead><tr><th>{t.dormitory}</th><th>{t.state}</th><th>{t.coverage}</th><th>{t.open}</th><th className="row-action-heading">{t.actions}</th></tr></thead>
    <tbody>{sortedDorms.map(dorm => <tr key={dorm.id} className={`dorm-row assurance-${dormHeadline(dorm, findings)}`}
      onClick={event => { if (!(event.target as Element).closest('button')) setSelectedDorm(dorm) }}>
      <td><button className="dorm-name" onClick={() => setSelectedDorm(dorm)}>
        <span className="dorm-symbol"><Building2 size={20} aria-hidden /></span><span>{dorm.name}
          <small>{dorm.zones} {t.zones} <span>·</span> {dorm.locations} {t.locations}</small></span></button></td>
      <td data-label={t.state}><HeadlineBadge state={dormHeadline(dorm, findings)} /></td>
      <td data-label={t.coverage}><span className="check-count"><strong>{dorm.done}</strong><span> / {dorm.due} {t.checksDone}</span></span>
        {dorm.missed > 0 && <small className="missed"><span className="dot" />{dorm.missed} {t.missed}</small>}
        {remainingChecks(dorm) > 0 && <small className="check-note">{remainingCheckSummary(dorm)}</small>}</td>
      <td data-label={t.open}><button className="count-button" aria-label={`${dorm.name}: ${t.open}`} onClick={() => openDormFindings(dorm.id)}>
        {findings.filter(f => f.dormId === dorm.id && isOpen(f)).length}<ChevronRight size={13} aria-hidden /></button></td>
      <td className="record-action"><button className="icon-button" onClick={() => setSelectedDorm(dorm)} aria-label={`${t.viewDetails}: ${dorm.name}`}><ChevronRight size={18} /></button></td>
    </tr>)}</tbody>
  </table>{sortedDorms.length === 0 && <div className="empty-state"><h3>{t.noResults}</h3>
    <button className="text-button" onClick={clearFilters}>{t.clearFilters}</button></div>}</div>

  return <div className="app-shell">
    {mobileNav && <button className="nav-scrim" aria-label={t.close} onClick={() => setMobileNav(false)} />}
    <aside id="sidebar" className={`sidebar ${mobileNav ? 'visible' : ''}`}>
      <a href="#main" className="brand" aria-label={t.brandDescription}>
        <img src="/wallinde-lockup-dark.png" alt="" width="552" height="224" /></a>
      <div className="school-card"><span className="school-icon"><Building2 size={19} aria-hidden /></span>
        <div><strong>{t.school}</strong><small>{t.schoolNote}</small></div></div>
      <div className="nav-caption">{t.workspace}</div>
      <nav aria-label={t.nav}>{pages.map(item => {
        const Icon = pageIcons[item]
        const count = item === 'findings' ? findings.filter(isOpen).length :
          item === 'verification' ? findings.filter(f => f.status === 'awaiting_verification').length : null
        return <button key={item} className={`nav-item ${page === item ? 'active' : ''}`}
          aria-current={page === item ? 'page' : undefined} onClick={() => navigate(item)}>
          <Icon size={19} aria-hidden /><span>{t[item]}</span>{count !== null && <span className="nav-count">{count}</span>}
        </button>
      })}</nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note"><ShieldCheck size={22} aria-hidden /><strong>{t.priorityTitle}</strong><p>{t.priorityNote}</p></div>
        <div className="profile"><span className="avatar">HS</span><div><strong>{t.user}</strong><small>{t.demoRole}</small></div>
          <span className="online-dot" /></div>
      </div>
    </aside>
    <div className="workspace" inert={mobileNav}>
      <header className="topbar"><div className="breadcrumb">
        <button className="icon-button mobile-toggle" aria-label={t.navigation} aria-expanded={mobileNav}
          aria-controls="sidebar" onClick={() => setMobileNav(!mobileNav)}><Menu size={21} /></button>
        <img className="mobile-brand" src="/wallinde-icon-light.png" alt={t.brand} width="32" height="32" />
        <span>{t.workspace}</span><ChevronRight size={14} aria-hidden /><strong>{t[page]}</strong>
      </div><div className="topbar-right"><span className="date-pill"><CalendarDays size={15} aria-hidden />{t.sampleDate}</span>
        <button className="icon-button" aria-label={t.emEmergencyShortcut} onClick={() => navigate('emergency')}><TriangleAlert size={19} /></button>
        <button className="icon-button reset-button" aria-label={t.reset} title={t.reset} onClick={() => setShowReset(true)}><RefreshCw size={17} /></button></div></header>
      <main id="main">
        <div className="prototype-banner"><div><FlaskConical size={17} aria-hidden /><strong>{t.sample}</strong>
          <span>{t.sampleNote}</span><a className="live-link" href="/live">{t.liveDashboard}</a></div><span className="prototype-pill">{t.prototype}</span></div>
        <div hidden={page !== 'emergency'}><EmergencyDashboard key={emergencyReset} findings={findings} /></div>
        {page !== 'emergency' && <>
        <section className="page-heading"><div><p className="eyebrow">{t.briefing}</p>
          <h1>{page === 'overview' ? t.title : page === 'verification' ? t.verificationTitle : t[page]}</h1>
          <p>{page === 'overview' ? t.subtitle : page === 'verification' ? t.verificationSubtitle :
            page === 'dormitories' ? t.dormSubtitle : t.findingSubtitle}</p></div>
          <button className="button primary" onClick={() => setNewFinding(true)}><Plus size={17} aria-hidden />{t.newFinding}</button>
        </section>

        {page === 'overview' && <section className="panel queue-panel" aria-label={t.queueTitle}>
          <div className="queue-heading"><h2>{t.queueTitle}</h2><span className="eyebrow">{t.remaining}</span></div>
          <p>{t.queueNote}</p>
          <div className="attention-grid">
            <button className="queue-item queue-red" onClick={() => { navigate('findings'); setSeverityFilter('critical') }}>
              <span className="queue-icon"><TriangleAlert size={20} aria-hidden /></span><span><strong>{t.criticalQueue}</strong><small>{t.criticalQueueNote}</small></span><b>{critical.length}</b><ChevronRight size={18} aria-hidden /></button>
            <button className="queue-item queue-red" onClick={() => { navigate('findings', 'action_required'); setOnlyOverdue(true) }}>
              <span className="queue-icon"><Clock3 size={20} aria-hidden /></span><span><strong>{t.overdueQueue}</strong><small>{t.overdueQueueNote}</small></span><b>{overdue.length}</b><ChevronRight size={18} aria-hidden /></button>
            <button className="queue-item queue-green" onClick={() => { navigate('findings', 'action_required'); setOnlyMine(true) }}>
              <span className="queue-icon"><ClipboardList size={20} aria-hidden /></span><span><strong>{t.myTasks}</strong><small>{t.myTasksNote}</small></span><b>{myActions.length}</b><ChevronRight size={18} aria-hidden /></button>
            <button className="queue-item queue-amber" onClick={() => navigate('findings', 'open')}>
              <span className="queue-icon"><UsersRound size={20} aria-hidden /></span><span><strong>{t.unownedQueue}</strong><small>{t.unownedQueueNote}</small></span><b>{unassigned.length}</b><ChevronRight size={18} aria-hidden /></button>
            <button className="queue-item queue-blue" onClick={() => navigate('verification')}>
              <span className="queue-icon"><BadgeCheck size={20} aria-hidden /></span><span><strong>{t.verifyQueue}</strong><small>{t.verifyQueueNote}</small></span><b>{awaiting.length}</b><ChevronRight size={18} aria-hidden /></button>
            <button className="queue-item queue-blue" onClick={() => { navigate('dormitories'); setOnlyMissed(true) }}>
              <span className="queue-icon"><Clock3 size={20} aria-hidden /></span><span><strong>{t.missedQueue}</strong><small>{t.missedQueueNote}</small></span><b>{missed}</b><ChevronRight size={18} aria-hidden /></button>
          </div>
        </section>}

        {page === 'overview' && <section className="metric-grid" aria-label={t.overview}>
          <button className="metric-card metric-blue" onClick={() => navigate('dormitories')}>
            <div className="metric-label"><span>{t.monitored}</span><span className="metric-icon"><Building2 size={19} aria-hidden /></span></div>
            <strong className="metric-value">{scopedDorms.length.toString().padStart(2, '0')}<ArrowUpRight size={19} aria-hidden /></strong><small>{t.monitoredNote}</small></button>
          <button className="metric-card metric-green" onClick={() => navigate('dormitories')}>
            <div className="metric-label"><span>{t.checks}</span><span className="metric-icon"><ClipboardList size={19} aria-hidden /></span></div>
            <strong className="metric-value">{scopedDorms.reduce((sum, dorm) => sum + dorm.done, 0)}
              <span>{t.of} {scopedDorms.reduce((sum, dorm) => sum + dorm.due, 0)}</span></strong><small>{t.checksNote}</small></button>
          <button className="metric-card metric-red" onClick={() => navigate('findings')}>
            <div className="metric-label"><span>{t.openFindings}</span><span className="metric-icon"><TriangleAlert size={19} aria-hidden /></span></div>
            <strong className="metric-value">{unresolved.length.toString().padStart(2, '0')}<ArrowUpRight size={19} aria-hidden /></strong><small>{t.openFindingsNote}</small></button>
          <button className="metric-card metric-yellow" onClick={() => navigate('verification')}>
            <div className="metric-label"><span>{t.awaiting}</span><span className="metric-icon"><BadgeCheck size={19} aria-hidden /></span></div>
            <strong className="metric-value">{awaiting.length.toString().padStart(2, '0')}<ArrowUpRight size={19} aria-hidden /></strong><small>{t.awaitingNote}</small></button>
        </section>}

        <div className={`content-grid ${page !== 'overview' ? 'full' : ''}`}><div className="main-column">
          {(page === 'overview' || page === 'dormitories') && <section className="panel">
            <div className="panel-heading"><div><h2>{t.dormTitle}</h2><p>{t.dormSubtitle}</p></div><span className="sort-hint"><SlidersHorizontal size={14} aria-hidden />{t.attention}</span></div>
            <div className="panel-filters"><label className="select-with-icon"><Building2 size={15} aria-hidden />
              <select aria-label={t.dormFilter} value={dormFilter} onChange={event => setDormFilter(event.target.value)}>
                <option value="all">{t.allDormitories}</option>
                {dormitories.map(dorm => <option value={dorm.id} key={dorm.id}>{dorm.name}</option>)}</select></label>
              {page === 'dormitories' && <label className="checkbox-label"><input type="checkbox" checked={onlyMissed}
                onChange={event => setOnlyMissed(event.target.checked)} />{t.missedChecks}</label>}
              <span className="evaluated"><span className="dot" />{t.evaluated}</span></div>
            {dormTable}
          </section>}
          {page !== 'dormitories' && <section className="panel findings-panel">
            <div className="panel-heading"><div><h2>{page === 'verification' ? t.verification : t.findingTitle}</h2>
              <p>{page === 'verification' ? t.independentNote : t.findingSubtitle}</p></div>
              {page === 'overview' && <button className="text-button" onClick={() => navigate('findings')}>{t.allFindings}<ArrowRight size={15} aria-hidden /></button>}</div>
            {page !== 'overview' && <div className="finding-filters">
              <label className="search-field"><Search size={16} aria-hidden /><input aria-label={t.search} placeholder={t.searchPlaceholder} value={search} onChange={e => setSearch(e.target.value)} /></label>
              <select aria-label={t.dormFilter} value={dormFilter} onChange={e => setDormFilter(e.target.value)}>
                <option value="all">{t.allDormitories}</option>{dormitories.map(dorm => <option value={dorm.id} key={dorm.id}>{dorm.name}</option>)}</select>
              {page !== 'verification' && <select aria-label={t.filterStatus} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="active">{t.activeStatuses}</option><option value="all">{t.allStatuses}</option>
                {Object.entries(statusLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select>}
              <select aria-label={t.filterSeverity} value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
                <option value="all">{t.allSeverities}</option>{Object.entries(severityLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select>
              {(onlyMine || onlyOverdue) && <div className="active-filters">
                <span>{onlyMine ? t.myTasksFilter : t.overdueFilter}</span>
                <button className="text-button" onClick={clearFilters}>{t.clearFilters}</button></div>}
            </div>}
            {findingTable}
          </section>}
        </div>
        {page === 'overview' && <aside className="right-column">
          <section className="independent-card"><div className="independent-icon"><ShieldCheck size={29} aria-hidden /></div>
            <span className="eyebrow">{t.independentTitle}</span><h2>{t.priorityTitle}</h2><p>{t.priorityNote}</p>
            <button onClick={() => navigate('verification')}>{t.viewQueue}<ArrowRight size={17} aria-hidden /></button>
            <div className="decorative-ring one" /><div className="decorative-ring two" />
          </section>
          <section className="panel activity-panel"><h2>{t.history}</h2><p>{t.historyNote}</p>
            <div className="activity-item"><span className="activity-dot green" /><div><strong>{t.activityVerified}</strong><small>{dormName('palm')} · F-1036</small></div><CheckCheck size={15} aria-hidden /></div>
            <div className="activity-item"><span className="activity-dot review" /><div><strong>{t.activityCompleted}</strong><small>{dormName('acacia')} · F-1039</small></div><BadgeCheck size={15} aria-hidden /></div>
            <div className="activity-item"><span className="activity-dot amber" /><div><strong>{t.activityReported}</strong><small>{dormName('cedar')} · F-1042</small></div><ClipboardList size={15} aria-hidden /></div>
          </section>
        </aside>}</div>
        </>}
        <footer className="page-footer"><span><ShieldCheck size={14} aria-hidden />{t.footer}</span><span>{t.demoRole} <span>·</span> {t.sampleDate}</span></footer>
      </main>
    </div>
    <div className={`toast ${toast ? 'shown' : ''}`} role="status" aria-live="polite">
      {toast && <><CircleCheck size={19} aria-hidden /><span>{toast}</span><button aria-label={t.close} onClick={() => setToast('')}><X size={16} /></button></>}
    </div>
    {selected && <FindingDialog key={selected.id} finding={selected} onClose={() => setSelectedId(null)} onUpdate={updateFinding} />}
    {newFinding && <NewFindingDialog onClose={() => setNewFinding(false)} onCreate={finding => {
      const next = Math.max(...findings.map(item => Number(item.id.slice(2)))) + 1
      setFindings(current => [{ ...finding, id: `F-${next}` }, ...current])
      setNewFinding(false); setToast(t.reportedFinding)
    }} />}
    {selectedDorm && <Modal title={selectedDorm.name} onClose={() => setSelectedDorm(null)}>
      <div className="detail-section"><HeadlineBadge state={dormHeadline(selectedDorm, findings)} /><p className="dorm-detail-date">{t.evaluated}</p>
        <div className="dorm-detail-count"><Building2 size={24} aria-hidden /><strong>{selectedDorm.done} / {selectedDorm.due}</strong><span>{t.checks}</span></div>
        <p>{checkSummary(selectedDorm)}</p>
        {findings.filter(finding => finding.dormId === selectedDorm.id && isOpen(finding)).map(finding =>
          <button className="reason-item" key={finding.id} onClick={() => { setSelectedDorm(null); setSelectedId(finding.id) }}>
            <span className={`severity ${finding.severity}`}>{severityLabels[finding.severity]}</span><span><strong>{finding.title}</strong><small>{finding.id}</small></span><ChevronRight size={17} aria-hidden />
          </button>)}
        {selectedDorm.missed > 0 && <div className="notice warning"><Clock3 size={20} aria-hidden /><p>{selectedDorm.missed} {t.missedReason.toLowerCase()}</p></div>}
        {selectedDorm.evidencePending && <div className="notice warning"><Camera size={20} aria-hidden /><p>{t.pendingEvidence}</p></div>}
        {dormHeadline(selectedDorm, findings) === 'current' && <div className="notice success"><CircleCheck size={20} aria-hidden /><p>{t.noExceptions}</p></div>}
        <button className="button primary" onClick={() => openDormFindings(selectedDorm.id)}>{t.viewFindings}<ArrowRight size={16} aria-hidden /></button>
      </div>
    </Modal>}
    {showReset && <Modal title={t.resetTitle} onClose={() => setShowReset(false)}>
      <div className="detail-section"><p>{t.resetNote}</p><div className="form-actions">
        <button className="button secondary" onClick={() => setShowReset(false)}>{t.cancel}</button>
        <button className="button primary" onClick={() => {
          setFindings(structuredClone(initialFindings)); setEmergencyReset(current => current + 1)
          clearFilters(); setShowReset(false); setToast(t.resetDone)
        }}>{t.confirm}</button></div></div>
    </Modal>}
  </div>
}

export default App
