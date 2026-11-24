import { useState } from 'react'
import type { FormEvent } from 'react'
import { Bell, CalendarDays, Check, Clock3, MapPin, Plus, TriangleAlert, UsersRound } from 'lucide-react'
import { CURRENT_USER, SAMPLE_DAY, dormitories, people } from './data'
import type { Finding } from './data'
import { t } from './strings'

type PersonKind = 'student' | 'staff' | 'visitor'
type RollStatus = 'unaccounted' | 'at_assembly' | 'needs_assistance' | 'confirmed_offsite' | 'released'
type Phase = 'planned' | 'active' | 'recovery' | 'closed'
type SampleRole = 'officer' | 'supervisor' | 'administrator'
interface Occupant {
  id: string; name: string; kind: PersonKind; dormId: string; away: boolean; awayUntil?: number; assistance: string
}
interface Guardian { id: string; personId: string; name: string; approved: boolean }
interface Roll extends Occupant {
  status: RollStatus; rosterAt: number; confirmedAt?: number; confirmedBy?: string; point?: string; note?: string
}
interface Alert {
  recipient: string; stage: 'primary' | 'backup'; deadline: number; round: number
  status: 'queued' | 'acknowledged' | 'escalated' | 'failed' | 'cancelled'
}
interface Duty {
  id: string; dormId: string; primary: string; backup: string; lead: string
  start: number; end: number; note: string
}
interface Improvement { id: string; title: string; observation: string; owner: string; due: string; completed: boolean }
interface Incident {
  id: string; dormId: string; title: string; hazard: string; location: string; drill: boolean; phase: Phase
  planned: string; scenarios: string[]; plan: string; approval: string; started?: number; acknowledged?: number
  round: number; primary: string; backup: string; lead: string; rolls: Roll[]; alerts: Alert[]; tasks: Improvement[]
  recovery?: { accommodation: string; welfare: string; learning: string; approved: boolean; decision: string }
  releases: { person: string; guardian: string; note: string; at: number }[]
  evidence: string[]
}
const initialTime = Date.parse(`${SAMPLE_DAY}T22:00:00+03:00`)
const initialOccupants: Occupant[] = [
  { id: 'student-a', name: 'Sample student A', kind: 'student', dormId: 'jacaranda', away: false, assistance: '' },
  { id: 'student-b', name: 'Sample student B', kind: 'student', dormId: 'jacaranda', away: false, assistance: 'Sample approved assistance plan' },
  { id: 'staff-a', name: 'Sample staff member', kind: 'staff', dormId: 'jacaranda', away: false, assistance: '' },
  { id: 'visitor-a', name: 'Sample visitor', kind: 'visitor', dormId: 'jacaranda', away: true,
    awayUntil: initialTime + 8 * 3_600_000, assistance: '' },
]
const rollLabels: Record<RollStatus, string> = {
  unaccounted: t.emUnaccounted, at_assembly: t.emAssembly, needs_assistance: t.emAssistance,
  confirmed_offsite: t.emOffsite, released: t.emReleased,
}
const phaseLabels: Record<Phase, string> = {
  planned: t.emPlanned, active: t.emActive, recovery: t.emRecovery, closed: t.emClosed,
}
const personName = (id: string) => people.find(p => p.id === id)?.name ?? t.emUnassigned
const formatTime = (time: number) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi',
}).format(time)
const formData = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault()
  return new FormData(event.currentTarget)
}
const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const uid = () => crypto.randomUUID()

export function EmergencyDashboard({ findings }: { findings: Finding[] }) {
  const [role, setRole] = useState<SampleRole>('supervisor')
  const [section, setSection] = useState('incidents')
  const [clock, setClock] = useState(initialTime)
  const [minutes, setMinutes] = useState(5)
  const [timingApproved, setTimingApproved] = useState(false)
  const [occupants, setOccupants] = useState(initialOccupants)
  const [guardians, setGuardians] = useState<Guardian[]>([])
  const [contacts, setContacts] = useState<{ name: string; phone: string; purpose: string; approved: boolean }[]>([])
  const [points, setPoints] = useState<{ id: string; dormId: string; name: string }[]>([
    { id: 'point-jacaranda', dormId: 'jacaranda', name: t.emSamplePoint },
  ])
  const [duties, setDuties] = useState<Duty[]>([{
    id: 'night-duty', dormId: 'jacaranda', primary: CURRENT_USER, backup: 'officer-a', lead: CURRENT_USER,
    start: initialTime, end: initialTime + 8 * 3_600_000, note: t.emSampleDutyNote,
  }])
  const [handovers, setHandovers] = useState<{ id: string; outgoing: string; incoming: string; note: string; accepted: boolean }[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [selected, setSelected] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [personOpen, setPersonOpen] = useState('')
  const lead = role !== 'officer', admin = role === 'administrator'
  const incident = incidents.find(i => i.id === selected)
  const active = incident && ['active', 'recovery'].includes(incident.phase)

  function update(id: string, apply: (current: Incident) => Incident) {
    setIncidents(current => current.map(i => i.id === id ? apply(i) : i))
  }
  function activate(i: Incident): Incident {
    const duty = duties.find(d => d.dormId === i.dormId && d.start <= clock && d.end > clock)
    const primary = duty?.primary ?? '', backup = duty?.backup ?? ''
    const alerts: Alert[] = [{ recipient: primary, stage: 'primary', deadline: clock + minutes * 60_000,
      round: i.round, status: primary ? 'queued' : 'failed' }]
    if (!primary) alerts.push({ recipient: backup, stage: 'backup', deadline: clock + minutes * 60_000,
      round: i.round, status: backup ? 'queued' : 'failed' })
    return { ...i, phase: 'active', started: clock, primary, backup, lead: duty?.lead ?? '',
      rolls: occupants.filter(p => p.dormId === i.dormId).map(p => ({ ...p, rosterAt: clock, status: 'unaccounted' })),
      alerts }
  }
  function createReport(event: FormEvent<HTMLFormElement>, drill = false) {
    const form = formData(event)
    if (drill && !lead) return
    let record: Incident = {
      id: uid(), dormId: value(form, 'dorm'), title: value(form, 'title'), hazard: value(form, 'hazard'),
      location: value(form, 'location'), drill, phase: drill ? 'planned' : 'active',
      planned: value(form, 'planned'), scenarios: ['night', 'communications', 'assistance'].filter(s => form.has(s)),
      plan: value(form, 'plan'), approval: value(form, 'approval'), round: 1, primary: '', backup: '', lead: '',
      rolls: [], alerts: [], tasks: [], releases: [], evidence: [],
    }
    if (!drill) record = activate(record)
    setIncidents(current => [record, ...current]); setSelected(record.id); setSection(drill ? 'drills' : 'incidents')
    setReportOpen(false); setMessage(t.emNothingDispatched)
  }
  function advance() {
    const next = clock + minutes * 60_000
    setClock(next)
    setIncidents(current => current.map(i => {
      if (i.phase !== 'active' || i.acknowledged) return i
      const alerts = i.alerts.map(a => ({ ...a }))
      const primary = alerts.find(a => a.round === i.round && a.stage === 'primary')
      if (primary && next >= primary.deadline && !['acknowledged', 'cancelled', 'failed'].includes(primary.status)) {
        primary.status = 'escalated'
        if (!alerts.some(a => a.round === i.round && a.stage === 'backup')) alerts.push({
          recipient: i.backup, stage: 'backup', deadline: next + minutes * 60_000,
          round: i.round, status: i.backup ? 'queued' : 'failed',
        })
      }
      alerts.filter(a => a.stage === 'backup' && a.round === i.round && a.status === 'queued'
        && next >= a.deadline).forEach(a => { a.status = 'failed' })
      return { ...i, alerts }
    }))
  }
  function acknowledge() {
    if (role === 'administrator' || !incident || incident.phase !== 'active' || incident.acknowledged ||
      !incident.alerts.some(a => a.round === incident.round && a.recipient === CURRENT_USER && a.status !== 'cancelled')) return
    update(incident.id, i => ({ ...i, acknowledged: clock, alerts: i.alerts.map(a =>
      a.round === i.round ? { ...a, status: a.recipient === CURRENT_USER ? 'acknowledged' : 'cancelled' } : a) }))
    setMessage(t.emAcknowledgementNotSafety)
  }
  function confirm(event: FormEvent<HTMLFormElement>, personId: string) {
    const form = formData(event)
    if (!incident || !active) return
    const status = value(form, 'status') as Exclude<RollStatus, 'released'>
    const point = value(form, 'point')
    if (status === 'at_assembly' && !points.some(p => p.id === point && p.dormId === incident.dormId)) {
      setMessage(t.emPointRequired); return
    }
    update(incident.id, i => ({ ...i,
      recovery: i.recovery && ['unaccounted', 'needs_assistance'].includes(status)
        ? { ...i.recovery, approved: false, decision: '' } : i.recovery,
      rolls: i.rolls.map(p => p.id === personId && p.status !== 'released' ? {
        ...p, status, point: status === 'at_assembly' ? point : undefined,
        note: value(form, 'note'), confirmedAt: clock, confirmedBy: personName(CURRENT_USER),
      } : p),
    }))
    setPersonOpen(''); setMessage(t.emConfirmationRecorded)
  }
  function blocker(i: Incident): string {
    if (!i.rolls.length) return t.emEmptyRosterWarning
    if (i.rolls.some(p => ['unaccounted', 'needs_assistance'].includes(p.status))) return t.emPeopleBlock
    if (i.tasks.some(task => !task.completed)) return t.emTasksBlock
    if (!i.drill && findings.some(f => f.dormId === i.dormId && ['critical', 'high'].includes(f.severity)
      && f.status !== 'verified_closed')) return t.emFindingsBlock
    return ''
  }
  function approveRecovery(event: FormEvent<HTMLFormElement>) {
    const form = formData(event)
    if (!incident || !lead || incident.drill || incident.phase !== 'recovery' || !incident.recovery) return
    const failure = blocker(incident)
    if (failure) { setMessage(failure); return }
    if (!form.has('authorised')) return
    update(incident.id, i => ({ ...i, recovery: { ...i.recovery!, approved: true, decision: value(form, 'decision') } }))
    setMessage(t.emDecisionRecorded)
  }
  function closeIncident() {
    if (!incident || !lead || incident.phase !== 'recovery') return
    const failure = blocker(incident) || (!incident.drill && !incident.recovery?.approved ? t.emApprovalRequired : '')
    if (failure) { setMessage(failure); return }
    update(incident.id, i => ({ ...i, phase: 'closed' })); setMessage(t.emClosed)
  }
  function release(event: FormEvent<HTMLFormElement>, person: Roll) {
    const form = formData(event)
    if (!incident || !lead || incident.drill || incident.phase !== 'recovery' ||
      person.kind !== 'student' || person.status !== 'at_assembly' || !form.has('identity')) return
    const guardian = guardians.find(g => g.id === value(form, 'guardian') && g.personId === person.id && g.approved)
    if (!guardian) { setMessage(t.emGuardianBlock); return }
    update(incident.id, i => ({ ...i,
      rolls: i.rolls.map(p => p.id === person.id ? { ...p, status: 'released', confirmedAt: clock } : p),
      releases: [...i.releases, { person: person.name, guardian: guardian.name, note: value(form, 'verification'), at: clock }],
    }))
    setPersonOpen(''); setMessage(t.emSampleHandoverRecorded)
  }

  const dormSelect = (name = 'dorm') => <label>{t.emBuilding}<select name={name} defaultValue="jacaranda" required>
    {dormitories.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
  const personSelect = (name: string, label: string, defaultValue = CURRENT_USER) =>
    <label>{label}<select name={name} defaultValue={defaultValue} required>
      {people.filter(p => label === t.emLead ? p.id === 'supervisor-b' || (p.id === CURRENT_USER && role !== 'officer') :
        label === t.emPrimary || label === t.emBackup ? p.id !== CURRENT_USER || role !== 'administrator' : true)
        .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  const reportForm = (drill: boolean) => <form className="em-form" onSubmit={e => createReport(e, drill)}>
    <h2>{drill ? t.emPlanDrill : t.emRapidReport}</h2>
    <p>{drill ? t.emSafeDrillGuidance : t.emNoPhotoRequired}</p>
    {dormSelect()}
    <label>{t.emReportTitle}<input name="title" required maxLength={200} /></label>
    <label>{t.emHazard}<select name="hazard"><option value="fire">{t.emFire}</option>
      <option value="medical">{t.emMedical}</option><option value="flood">{t.emFlood}</option>
      <option value="weather">{t.emWeather}</option><option value="security">{t.emSecurity}</option>
      <option value="other">{t.emOther}</option></select></label>
    <label>{t.emLocation}<input name="location" maxLength={1000} /></label>
    {drill && <>
      <label>{t.emPlannedTime}<input name="planned" type="datetime-local" required defaultValue={`${SAMPLE_DAY}T22:00`} /></label>
      {(['night', 'communications', 'assistance'] as const).map((scenario, index) =>
        <label className="checkbox-label" key={scenario}><input name={scenario} type="checkbox" />
          {[t.emNightScenario, t.emCommunicationsScenario, t.emAssistanceScenario][index]}</label>)}
      <label>{t.emExercisePlan}<textarea name="plan" required maxLength={2000} /></label>
      <label>{t.emApprovalNote}<input name="approval" required maxLength={1000} /></label>
    </>}
    <button className="button primary" type="submit"><Plus size={16} aria-hidden />{drill ? t.emCreateDrill : t.emCreateReport}</button>
  </form>

  return <section className="emergency-workspace" aria-label={t.emergency}>
    <div className="em-heading"><div><p className="eyebrow">{t.emPrototype}</p><h1>{t.emergency}</h1></div>
      <button className="button primary" onClick={() => { setReportOpen(!reportOpen); setSection('incidents') }}>
        <TriangleAlert size={18} aria-hidden />{t.emRapidReport}</button></div>
    <div className="notice warning em-warning"><TriangleAlert size={20} aria-hidden /><p>{t.emWarning}</p></div>
    <div className="em-controls"><label>{t.emSimulatedRole}<select value={role} onChange={e => {
      setRole(e.target.value as SampleRole); setSection('incidents'); setSelected(''); setPersonOpen('')
    }}><option value="officer">{t.emOfficer}</option><option value="supervisor">{t.emSupervisor}</option>
      <option value="administrator">{t.emAdministrator}</option></select></label>
      <span><Clock3 size={16} aria-hidden />{t.emSimulatedClock}: {formatTime(clock)}</span>
      <button className="button secondary" onClick={advance}>{t.emAdvanceClock} ({minutes} {t.emMinutes})</button>
    </div>
    <p className="muted">{timingApproved ? t.emTimingApproved : t.emTimingUnapproved}</p>
    <nav className="em-tabs" aria-label={t.emSections}>
      {['incidents', 'roster', 'contacts', 'duty', ...(lead ? ['drills', 'recovery'] : []),
        ...(admin ? ['setup'] : [])].map((item, index) => <button className={`button ${section === item ? 'primary' : 'secondary'}`}
        key={item} aria-current={section === item ? 'page' : undefined} onClick={() => { setSection(item); setSelected(''); setReportOpen(false) }}>
        {item === 'incidents' ? <Bell size={16} aria-hidden /> : item === 'roster' ? <UsersRound size={16} aria-hidden /> : <CalendarDays size={16} aria-hidden />}
        {{ incidents: t.emIncidents, roster: t.emRoster, contacts: t.emContacts, duty: t.emDuty,
          drills: t.emDrills, recovery: t.emRecovery, setup: t.emSetup }[item] ?? index}</button>)}
    </nav>
    {message && <div role="status" className="notice warning em-message">{message}
      <button className="text-button" onClick={() => setMessage('')}>{t.close}</button></div>}
    {reportOpen && reportForm(false)}
    {!incident && ['incidents', 'drills', 'recovery'].includes(section) && <>
      {section === 'drills' && lead && reportForm(true)}
      <div className="em-card-grid">{incidents.filter(i => section === 'drills' ? i.drill :
        section === 'recovery' ? !i.drill && i.phase === 'recovery' : true).map(i =>
        <button key={i.id} className={`em-card ${i.drill || i.phase === 'closed' ? 'em-blue' : 'em-red'}`}
          onClick={() => setSelected(i.id)}>
          <strong>{i.title}</strong><span>{dormitories.find(d => d.id === i.dormId)?.name}</span>
          <span>{i.drill ? t.emDrill : phaseLabels[i.phase]}</span>
        </button>)}</div>
      {!incidents.length && <p>{t.emNoIncidents}</p>}
    </>}
    {incident && <div className="em-incident">
      <button className="text-button" onClick={() => setSelected('')}>{t.emBack}</button>
      <h2>{incident.title}</h2><p>{phaseLabels[incident.phase]} · {incident.drill ? t.emDrill : t.emSampleIncident}</p>
      {incident.drill && <div className="notice warning">{t.emDrillWarning}<p>{incident.plan}</p>
        <p>{incident.approval} · {incident.scenarios.map(s => ({ night: t.emNightScenario,
          communications: t.emCommunicationsScenario, assistance: t.emAssistanceScenario }[s])).join(' / ')}</p></div>}
      <div className="em-card em-blue"><span>{t.emPrimary}: {personName(incident.primary)}</span>
        <span>{t.emBackup}: {personName(incident.backup)}</span><span>{t.emLead}: {personName(incident.lead)}</span>
        <strong>{incident.acknowledged ? t.emAcknowledged : t.emNoAcknowledgement}</strong></div>
      {incident.alerts.map((alert, index) => <div className={`em-card ${alert.status === 'failed' || alert.status === 'escalated' ? 'em-red' : 'em-blue'}`} key={index}>
        <strong>{alert.stage === 'primary' ? t.emPrimary : t.emBackup}: {personName(alert.recipient)}</strong>
        <span>{{ queued: t.emQueued, acknowledged: t.emAcknowledged, escalated: t.emEscalated,
          failed: t.emFailed, cancelled: t.emCancelled }[alert.status]}</span>
        <span>{t.emDeadline}: {formatTime(alert.deadline)}</span>
      </div>)}
      {role !== 'administrator' && active && incident.phase === 'active' && !incident.acknowledged && incident.alerts.some(a =>
        a.round === incident.round && a.recipient === CURRENT_USER && a.status !== 'cancelled') &&
        <button className="button primary" onClick={acknowledge}>{t.emAcknowledge}</button>}
      {lead && incident.phase === 'active' && !incident.acknowledged && <form className="em-form" onSubmit={event => {
        const form = formData(event), primary = value(form, 'primary'), backup = value(form, 'backup')
        if (primary === backup) { setMessage(t.emDifferentBackup); return }
        update(incident.id, i => ({ ...i, primary, backup, lead: value(form, 'lead'), round: i.round + 1,
          alerts: [...i.alerts.map(a => a.status === 'queued' ? { ...a, status: 'cancelled' as const } : a),
            { recipient: primary, stage: 'primary', deadline: clock + minutes * 60_000, round: i.round + 1, status: 'queued' }],
        }))
      }}><h3>{t.emAssignResponders}</h3>{personSelect('primary', t.emPrimary)}{personSelect('backup', t.emBackup, 'officer-a')}
        {personSelect('lead', t.emLead)}<button className="button secondary">{t.emAssignResponders}</button></form>}
      {lead && incident.drill && incident.phase === 'planned' &&
        <button className="button primary" onClick={() => update(incident.id, activate)}>{t.emStartDrill}</button>}
      <h3>{t.emRollCall}</h3><p>{t.emRosterNotAttendance}</p>
      {!incident.rolls.length ? <div className="notice warning">{t.emEmptyRosterWarning}</div> : <>
        <div className="em-card-grid">{Object.entries(rollLabels).map(([status, label]) =>
          <div className={`em-card ${['unaccounted', 'needs_assistance'].includes(status) ? 'em-red' : 'em-blue'}`} key={status}>
            <strong>{label}</strong><span>{incident.rolls.filter(p => p.status === status).length}</span></div>)}</div>
        {incident.rolls.map(person => <div className={`em-card ${['unaccounted', 'needs_assistance'].includes(person.status) ? 'em-red' : 'em-blue'}`} key={person.id}>
          <button className="em-row-button" onClick={() => setPersonOpen(personOpen === person.id ? '' : person.id)}>
            <UsersRound size={18} aria-hidden /><strong>{person.name}</strong><span>{rollLabels[person.status]}</span></button>
          {personOpen === person.id && <div className="em-person-detail"><p>{person.kind} · {person.away ? t.emTemporaryAbsence : t.emExpectedOnCampus}</p>
            {person.awayUntil && <p>{t.emExpectedReturn}: {formatTime(person.awayUntil)}</p>}
            <p>{t.emRosterAsOf}: {formatTime(person.rosterAt)}</p>
            <p>{person.assistance}</p><p>{t.emLastConfirmed}: {person.confirmedAt ? formatTime(person.confirmedAt) : t.emNeverConfirmed}</p>
            {person.confirmedBy && <p>{t.emConfirmedBy}: {person.confirmedBy}</p>}
            {person.note && <p>{person.note}</p>}
            {active && person.status !== 'released' && <form className="em-dark-form" onSubmit={e => confirm(e, person.id)}>
              <label>{t.emPersonStatus}<select name="status" defaultValue={person.status}>
                {Object.entries(rollLabels).filter(([s]) => s !== 'released').map(([s, label]) => <option key={s} value={s}>{label}</option>)}</select></label>
              <label>{t.emAssemblyPoint}<select name="point" defaultValue={person.point ?? ''}><option value="">{t.emChoosePoint}</option>
                {points.filter(p => p.dormId === incident.dormId).map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
              <label>{t.emConfirmationNote}<input name="note" required maxLength={2000} /></label>
              <button className="button primary">{t.emConfirmPerson}</button>
            </form>}
            {lead && !incident.drill && incident.phase === 'recovery' && person.kind === 'student' && person.status === 'at_assembly' &&
              <form className="em-dark-form" onSubmit={e => release(e, person)}>
                <h4>{t.emGuardianHandover}</h4><label>{t.emAuthorisedGuardian}<select required name="guardian" defaultValue="">
                  <option value="">{t.emChooseGuardian}</option>{guardians.filter(g => g.personId === person.id && g.approved)
                    .map(g => <option value={g.id} key={g.id}>{g.name}</option>)}</select></label>
                <label className="checkbox-label"><input name="identity" type="checkbox" required />{t.emIdentityChecked}</label>
                <label>{t.emVerificationNote}<input name="verification" required maxLength={2000} /></label>
                <button className="button primary">{t.emRecordHandover}</button>
              </form>}
          </div>}
        </div>)}
      </>}
      {incident.drill && incident.started && <p>{t.emReadinessMetrics}: {incident.rolls.filter(p => p.status === 'at_assembly').length}
        /{incident.rolls.length} {t.emAssembly}. {incident.acknowledged
          ? `${Math.max(0, (incident.acknowledged - incident.started) / 1000)} ${t.emAcknowledgementSeconds}` : t.emNoAcknowledgement}</p>}
      {active && <form className="em-form" onSubmit={event => {
        const form = formData(event)
        update(incident.id, i => ({ ...i, evidence: [...i.evidence, value(form, 'evidence')] }))
        event.currentTarget.reset()
      }}><label>{t.emLaterEvidence}<input name="evidence" required maxLength={500} /></label>
        <p>{t.emEvidenceSimulation}</p><button className="button secondary">{t.emAddEvidence}</button></form>}
      {incident.evidence.map((note, index) => <p key={index}>{t.emSampleEvidence}: {note}</p>)}
      <h3>{t.emImprovements}</h3><p>{t.emTasksNotFindings}</p>
      {incident.tasks.map(task => <div className="em-card em-blue" key={task.id}><strong>{task.title}</strong>
        <span>{task.observation}</span><span>{personName(task.owner)} · {task.due}</span>
        {task.completed ? <span>{t.emTaskCompleted}</span> : task.owner === CURRENT_USER && active &&
          <button className="button primary" onClick={() => update(incident.id, i => ({
            ...i, tasks: i.tasks.map(item => item.id === task.id ? { ...item, completed: true } : item),
          }))}>{t.emCompleteTask}</button>}</div>)}
      {lead && active && <form className="em-form" onSubmit={event => {
        const form = formData(event)
        update(incident.id, i => ({ ...i, recovery: i.recovery && { ...i.recovery, approved: false, decision: '' },
          tasks: [...i.tasks, { id: uid(), title: value(form, 'task'), observation: value(form, 'observation'),
            owner: value(form, 'owner'), due: value(form, 'due'), completed: false }] }))
        event.currentTarget.reset()
      }}><label>{t.emObservation}<textarea name="observation" required maxLength={2000} /></label>
        <label>{t.emImprovementAction}<input name="task" required maxLength={500} /></label>{personSelect('owner', t.owner)}
        <label>{t.due}<input name="due" type="date" required defaultValue={SAMPLE_DAY} /></label>
        <button className="button secondary">{t.emAddImprovement}</button></form>}
      {lead && active && !incident.drill && <form className="em-form" onSubmit={event => {
        const form = formData(event)
        update(incident.id, i => ({ ...i, recovery: { accommodation: value(form, 'accommodation'),
          welfare: value(form, 'welfare'), learning: value(form, 'learning'), approved: false, decision: '' } }))
        setMessage(t.emRecoverySaved)
      }}><h3>{t.emRecoveryPlan}</h3>
        <label>{t.emAccommodation}<textarea name="accommodation" required defaultValue={incident.recovery?.accommodation} /></label>
        <label>{t.emWelfare}<textarea name="welfare" required defaultValue={incident.recovery?.welfare} /></label>
        <label>{t.emLearning}<textarea name="learning" required defaultValue={incident.recovery?.learning} /></label>
        <button className="button secondary">{t.emSaveRecovery}</button></form>}
      {incident.recovery && <div className="em-card em-blue"><strong>{incident.recovery.approved ? t.emDecisionRecorded : t.emReopeningUnapproved}</strong>
        <span>{incident.recovery.decision}</span></div>}
      {lead && incident.phase === 'recovery' && !incident.drill && incident.recovery && !incident.recovery.approved &&
        <form className="em-form" onSubmit={approveRecovery}><label className="checkbox-label">
          <input type="checkbox" name="authorised" required />{t.emAuthorisedDecision}</label>
          <label>{t.emDecisionNote}<textarea required name="decision" maxLength={2000} /></label>
          <button className="button primary">{t.emApproveReopening}</button></form>}
      {incident.releases.map((record, index) => <div className="em-card em-blue" key={index}>
        <strong>{record.person} → {record.guardian}</strong><span>{record.note}</span><span>{formatTime(record.at)}</span></div>)}
      {lead && incident.phase === 'active' && <button className="button secondary" onClick={() => update(incident.id, i => ({
        ...i, phase: 'recovery', alerts: i.alerts.map(a => a.status === 'queued' ? { ...a, status: 'cancelled' } : a),
      }))}>{t.emMoveRecovery}</button>}
      {lead && incident.phase === 'recovery' && <button className="button primary" onClick={closeIncident}>{t.emCloseIncident}</button>}
    </div>}
    {!incident && section === 'roster' && <>
      <p>{t.emRosterNotAttendance}</p>
      {occupants.map(person => <div className="em-card em-blue" key={person.id}><strong>{person.name}</strong>
        <span>{person.kind} · {person.away ? t.emTemporaryAbsence : t.emExpectedOnCampus}</span>
        {person.awayUntil && <span>{t.emExpectedReturn}: {formatTime(person.awayUntil)}</span>}<span>{person.assistance}</span></div>)}
      {admin && <form className="em-form" onSubmit={event => {
        const form = formData(event), away = form.has('away'),
          awayUntil = value(form, 'return') ? Date.parse(value(form, 'return') + '+03:00') : undefined
        if (away && (awayUntil === undefined || !Number.isFinite(awayUntil))) {
          setMessage(t.emReturnRequired); return
        }
        const person: Occupant = { id: uid(), name: value(form, 'name'),
          kind: value(form, 'kind') as PersonKind, dormId: value(form, 'dorm'),
          away, awayUntil: away ? awayUntil : undefined, assistance: value(form, 'assistance') }
        setOccupants(current => [...current, person])
        setIncidents(current => current.map(i => ['active', 'recovery'].includes(i.phase) && i.dormId === person.dormId ? {
          ...i, rolls: [...i.rolls, { ...person, rosterAt: clock, status: 'unaccounted' }],
          recovery: i.recovery && { ...i.recovery, approved: false, decision: '' },
        } : i))
        event.currentTarget.reset(); setMessage(t.emRosterAdded)
      }}><h3>{t.emAddOccupant}</h3>{dormSelect()}<label>{t.emPersonName}<input name="name" required maxLength={200} /></label>
        <label>{t.emPersonKind}<select name="kind"><option value="student">{t.emStudent}</option>
          <option value="staff">{t.emStaff}</option><option value="visitor">{t.emVisitor}</option></select></label>
        <label className="checkbox-label"><input type="checkbox" name="away" />{t.emTemporaryAbsence}</label>
        <label>{t.emExpectedReturn}<input type="datetime-local" name="return" /></label>
        <label>{t.emAssistanceInstructions}<textarea name="assistance" maxLength={500} /></label>
        <button className="button primary">{t.emAddOccupant}</button></form>}
    </>}
    {!incident && section === 'contacts' && <>
      <p>{t.emNoCallsFromSample}</p>
      {contacts.filter(c => c.approved).map((c, index) => <div className="em-card em-blue" key={index}>
        <strong>{c.name}</strong><span>{c.phone} · {c.purpose}</span><span>{t.emApprovedSampleOnly}</span></div>)}
      {!contacts.some(c => c.approved) && <p>{t.emNoApprovedContacts}</p>}
    </>}
    {!incident && section === 'duty' && <>
      <p>{t.emNightDutyGuidance}</p>
      {duties.map(d => <div className="em-card em-blue" key={d.id}><strong>{dormitories.find(item => item.id === d.dormId)?.name}</strong>
        <span>{formatTime(d.start)} — {formatTime(d.end)}</span><span>{t.emPrimary}: {personName(d.primary)}</span>
        <span>{t.emBackup}: {personName(d.backup)}</span><span>{d.note}</span></div>)}
      {lead && <form className="em-form" onSubmit={event => {
        const form = formData(event), start = Date.parse(value(form, 'start') + '+03:00'), end = Date.parse(value(form, 'end') + '+03:00')
        const dormId = value(form, 'dorm'), primary = value(form, 'primary'), backup = value(form, 'backup')
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || primary === backup ||
          duties.some(d => d.dormId === dormId && d.start < end && d.end > start)) { setMessage(t.emShiftInvalid); return }
        setDuties(current => [...current, { id: uid(), dormId, primary, backup, lead: value(form, 'lead'),
          start, end, note: value(form, 'approval') }])
        setMessage(t.emShiftRecorded)
      }}><h3>{t.emAddShift}</h3>{dormSelect()}{personSelect('primary', t.emPrimary)}{personSelect('backup', t.emBackup, 'officer-a')}
        {personSelect('lead', t.emLead)}<label>{t.emShiftStart}<input type="datetime-local" name="start" required /></label>
        <label>{t.emShiftEnd}<input type="datetime-local" name="end" required /></label>
        <label>{t.emApprovalNote}<input name="approval" required /></label><button className="button primary">{t.emAddShift}</button></form>}
      <form className="em-form" onSubmit={event => {
        const form = formData(event), outgoing = duties.find(d => d.id === value(form, 'outgoing')),
          incoming = duties.find(d => d.id === value(form, 'incoming'))
        if (!outgoing || !incoming || outgoing.id === incoming.id || outgoing.dormId !== incoming.dormId ||
          incoming.start < outgoing.end || handovers.some(h => h.outgoing === outgoing.id && h.incoming === incoming.id) ||
          (!lead && ![outgoing.primary, outgoing.backup].includes(CURRENT_USER))) {
          setMessage(t.emHandoverInvalid); return
        }
        setHandovers(current => [...current, { id: uid(), outgoing: outgoing.id, incoming: incoming.id,
          note: value(form, 'note'), accepted: false }])
        setMessage(t.emHandoverPending)
      }}><h3>{t.emDutyHandover}</h3>{['outgoing', 'incoming'].map(name => <label key={name}>{name === 'outgoing' ? t.emOutgoingShift : t.emIncomingShift}
        <select name={name} required>{duties.map(d => <option value={d.id} key={d.id}>{dormitories.find(item => item.id === d.dormId)?.name} · {formatTime(d.start)}</option>)}</select></label>)}
        <label>{t.emHandoverNote}<textarea name="note" required /></label><button className="button secondary">{t.emRecordDutyHandover}</button></form>
      {handovers.map(h => <div className="em-card em-blue" key={h.id}><strong>{h.accepted ? t.emHandoverAccepted : t.emHandoverPending}</strong>
        <span>{h.note}</span>{!h.accepted && duties.find(d => d.id === h.incoming)?.primary === CURRENT_USER &&
          <button className="button primary" onClick={() => setHandovers(current => current.map(item => item.id === h.id ? { ...item, accepted: true } : item))}>
            <Check size={16} aria-hidden />{t.emAcceptHandover}</button>}</div>)}
    </>}
    {!incident && section === 'setup' && admin && <>
      <p>{t.emSyntheticOnly}</p>
      <form className="em-form" onSubmit={event => {
        const form = formData(event), next = Number(value(form, 'minutes'))
        if (next < 1 || next > 60) return
        setMinutes(next); setTimingApproved(form.has('approved')); setMessage(t.emTimingSaved)
      }}><label>{t.emAckMinutes}<input name="minutes" type="number" min="1" max="60" required defaultValue={minutes} /></label>
        <label className="checkbox-label"><input name="approved" type="checkbox" />{t.emRecordSchoolApproval}</label>
        <label>{t.emApprovalNote}<input name="approval" required /></label><button className="button primary">{t.emSaveTiming}</button></form>
      <form className="em-form" onSubmit={event => {
        const form = formData(event)
        setContacts(current => [...current, { name: value(form, 'name'), phone: value(form, 'phone'),
          purpose: value(form, 'purpose'), approved: form.has('approved') }]); event.currentTarget.reset()
      }}><h3>{t.emAddContact}</h3><label>{t.emContactName}<input name="name" required /></label>
        <label>{t.emPhone}<input name="phone" required /></label><label>{t.emContactPurpose}<input name="purpose" required /></label>
        <label className="checkbox-label"><input name="approved" type="checkbox" />{t.emRecordSchoolApproval}</label>
        <label>{t.emApprovalNote}<input name="approval" required /></label><button className="button primary">{t.emAddContact}</button></form>
      <form className="em-form" onSubmit={event => {
        const form = formData(event)
        setPoints(current => [...current, { id: uid(), dormId: value(form, 'dorm'), name: value(form, 'name') }])
        event.currentTarget.reset()
      }}><h3>{t.emAddPoint}</h3>{dormSelect()}<label>{t.emPointName}<input name="name" required /></label>
        <button className="button primary"><MapPin size={16} aria-hidden />{t.emAddPoint}</button></form>
      <form className="em-form" onSubmit={event => {
        const form = formData(event)
        setGuardians(current => [...current, { id: uid(), personId: value(form, 'student'), name: value(form, 'name'),
          approved: form.has('approved') }]); event.currentTarget.reset(); setMessage(t.emGuardianAdded)
      }}><h3>{t.emAddGuardian}</h3><label>{t.emStudent}<select name="student" required>{occupants.filter(p => p.kind === 'student')
        .map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
        <label>{t.emGuardianName}<input name="name" required /></label>
        <label className="checkbox-label"><input name="approved" type="checkbox" />{t.emRecordSchoolApproval}</label>
        <label>{t.emApprovalNote}<input name="approval" required /></label><button className="button primary">{t.emAddGuardian}</button></form>
    </>}
  </section>
}
