import { t } from './strings'

export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type FindingStatus = 'open' | 'action_required' | 'awaiting_verification' | 'verified_closed'
export type Headline = 'critical' | 'high' | 'incomplete' | 'attention' | 'current'
export type Page = 'overview' | 'dormitories' | 'findings' | 'verification' | 'emergency'
export const SAMPLE_DAY = '2026-11-18'
export const CURRENT_USER = 'head-security'
export const people = [
  { id: CURRENT_USER, name: 'You · Head of security', initials: 'HS' },
  { id: 'officer-a', name: 'Officer A', initials: 'OA' },
  { id: 'officer-b', name: 'Officer B', initials: 'OB' },
  { id: 'supervisor-b', name: 'Duty supervisor', initials: 'DS' },
]
export interface Action {
  title: string
  ownerId: string
  dueDate: string
  completionNote?: string
  completedBy?: string
  evidence?: boolean
  verificationNote?: string
  verifiedBy?: string
  rejectionNote?: string
}
export interface Finding {
  id: string
  dormId: string
  location: string
  title: string
  description: string
  severity: Severity
  status: FindingStatus
  reportedAt: string
  action?: Action
}
export interface Dormitory {
  id: string
  name: string
  code: string
  zones: number
  locations: number
  due: number
  done: number
  missed: number
  evidencePending: boolean
}
export const dormitories: Dormitory[] = [
  { id: 'cedar', name: 'Cedar House', code: 'CH', zones: 3, locations: 18, due: 8, done: 7, missed: 1, evidencePending: false },
  { id: 'acacia', name: 'Acacia House', code: 'AH', zones: 3, locations: 16, due: 8, done: 8, missed: 0, evidencePending: false },
  { id: 'baobab', name: 'Baobab House', code: 'BH', zones: 2, locations: 14, due: 8, done: 4, missed: 2, evidencePending: true },
  { id: 'jacaranda', name: 'Jacaranda House', code: 'JH', zones: 2, locations: 12, due: 8, done: 6, missed: 1, evidencePending: false },
  { id: 'palm', name: 'Palm House', code: 'PH', zones: 2, locations: 10, due: 8, done: 7, missed: 0, evidencePending: false },
  { id: 'fig', name: 'Fig House', code: 'FH', zones: 2, locations: 12, due: 8, done: 6, missed: 0, evidencePending: false },
]
export const initialFindings: Finding[] = [
  { id: 'F-1042', dormId: 'cedar', location: 'East wing · Emergency exit 02',
    title: 'Emergency exit obstructed', description: 'Storage items obstruct the marked exit route. Clear the route and confirm the door opens fully.',
    severity: 'critical', status: 'open', reportedAt: '2026-11-18T07:40:00+03:00' },
  { id: 'F-1041', dormId: 'acacia', location: 'Ground floor · Extinguisher point 01',
    title: 'Extinguisher pressure below range', description: 'The pressure indicator was outside the marked operating range during the morning check.',
    severity: 'high', status: 'action_required', reportedAt: '2026-11-17T08:20:00+03:00',
    action: { title: 'Arrange a qualified inspection and restore the extinguisher point.', ownerId: 'officer-a', dueDate: '2026-11-17' } },
  { id: 'F-1040', dormId: 'jacaranda', location: 'First floor · Corridor 01',
    title: 'Corridor lighting needs attention', description: 'Two light fittings did not illuminate during the evening check.',
    severity: 'medium', status: 'action_required', reportedAt: '2026-11-16T18:35:00+03:00',
    action: { title: 'Restore the corridor lighting and check the full route.', ownerId: CURRENT_USER, dueDate: SAMPLE_DAY } },
  { id: 'F-1039', dormId: 'acacia', location: 'West wing · Door 04',
    title: 'External locking mechanism removed', description: 'Remove the external locking fitting and demonstrate normal door operation.',
    severity: 'high', status: 'awaiting_verification', reportedAt: '2026-11-15T07:45:00+03:00',
    action: { title: 'Remove the external locking fitting.', ownerId: 'officer-b', dueDate: SAMPLE_DAY,
      completionNote: 'External fitting removed. Door opens freely from inside. Sample completion photo attached.',
      completedBy: 'officer-b', evidence: true } },
  { id: 'F-1038', dormId: 'fig', location: 'Ground floor · Corridor 02',
    title: 'Exit sign repositioned', description: 'The exit sign was not clearly visible from the corridor approach.',
    severity: 'low', status: 'awaiting_verification', reportedAt: '2026-11-14T09:10:00+03:00',
    action: { title: 'Reposition the exit sign in the corridor sightline.', ownerId: CURRENT_USER, dueDate: '2026-11-17',
      completionNote: 'Sign repositioned and checked from both corridor approaches.',
      completedBy: CURRENT_USER, evidence: true } },
  { id: 'F-1037', dormId: 'baobab', location: 'North wing · Room 08',
    title: 'Door identification label missing', description: 'The room location label needs replacing to support reliable manual identification.',
    severity: 'low', status: 'open', reportedAt: '2026-11-13T10:15:00+03:00' },
  { id: 'F-1036', dormId: 'palm', location: 'Ground floor · Emergency exit 01',
    title: 'Exit route cleared and verified', description: 'The route was cleared and independently checked.',
    severity: 'medium', status: 'verified_closed', reportedAt: '2026-11-12T08:30:00+03:00',
    action: { title: 'Clear the exit route.', ownerId: 'officer-a', dueDate: '2026-11-13',
      completionNote: 'Route cleared.', completedBy: 'officer-a', evidence: true,
      verificationNote: 'Door and route checked independently.', verifiedBy: 'supervisor-b' } },
]
export const severityLabels: Record<Severity, string> = {
  critical: t.criticalSeverity, high: t.highSeverity, medium: t.mediumSeverity, low: t.lowSeverity,
}
export const statusLabels: Record<FindingStatus, string> = {
  open: t.openStatus, action_required: t.actionStatus,
  awaiting_verification: t.awaitingStatus, verified_closed: t.closedStatus,
}
export const headlineLabels: Record<Headline, string> = {
  critical: t.critical, high: t.high, incomplete: t.incomplete, attention: t.attentionState, current: t.current,
}
export const ownerName = (id?: string) => people.find(person => person.id === id)?.name ?? t.unassigned
export const dormName = (id: string) => dormitories.find(dorm => dorm.id === id)?.name ?? id
export const isOpen = (finding: Finding) => finding.status !== 'verified_closed'
export const isOverdue = (finding: Finding) =>
  finding.status === 'action_required' && !!finding.action && finding.action.dueDate < SAMPLE_DAY
export function sortFindings(findings: Finding[]) {
  const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const priority = (finding: Finding) => !isOpen(finding) ? 5 :
    finding.severity === 'critical' ? 0 : isOverdue(finding) ? 1 : rank[finding.severity] + 1
  return [...findings].sort((a, b) =>
    priority(a) - priority(b) || rank[a.severity] - rank[b.severity] ||
    Number(!!a.action) - Number(!!b.action) ||
    a.reportedAt.localeCompare(b.reportedAt))
}
export const remainingChecks = (dorm: Dormitory) => Math.max(0, dorm.due - dorm.done - dorm.missed)
export const remainingCheckSummary = (dorm: Dormitory) =>
  `${remainingChecks(dorm)} ${remainingChecks(dorm) === 1 ? t.checkRemaining : t.checksRemaining}`
export const checkSummary = (dorm: Dormitory) => [
  `${dorm.done}/${dorm.due} ${t.checksDone}`,
  ...(remainingChecks(dorm) ? [remainingCheckSummary(dorm)] : []),
  ...(dorm.missed ? [`${dorm.missed} ${t.missed}`] : []),
].join(' · ')
export function dormHeadline(dorm: Dormitory, findings: Finding[]): Headline {
  const open = findings.filter(finding => finding.dormId === dorm.id && isOpen(finding))
  if (open.some(finding => finding.severity === 'critical')) return 'critical'
  if (open.some(finding => finding.severity === 'high')) return 'high'
  if (dorm.missed || dorm.evidencePending) return 'incomplete'
  if (open.length) return 'attention'
  return 'current'
}
export function sortDormitories(findings: Finding[]) {
  const rank: Record<Headline, number> = { critical: 0, high: 1, incomplete: 2, attention: 3, current: 4 }
  return [...dormitories].sort((a, b) => {
    const state = rank[dormHeadline(a, findings)] - rank[dormHeadline(b, findings)]
    if (state) return state
    const oldest = (id: string) => findings.filter(f => f.dormId === id && isOpen(f))
      .map(f => f.reportedAt).sort()[0] ?? '9999'
    return oldest(a.id).localeCompare(oldest(b.id))
  })
}
