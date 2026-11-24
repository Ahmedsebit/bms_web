import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { SAMPLE_DAY } from '../src/data'
import { t } from '../src/strings'

const workspace = (page: Page) => page.locator('.emergency-workspace')
const tab = (page: Page, name: string) => workspace(page).getByRole('navigation', {
  name: t.emSections,
}).getByRole('button', { name, exact: true })
const form = (page: Page, heading: string) => workspace(page).locator('form').filter({
  has: page.getByRole('heading', { name: heading, exact: true }),
})

async function report(page: Page, title = 'Synthetic rapid incident', dorm = 'jacaranda') {
  await workspace(page).getByRole('button', { name: t.emRapidReport, exact: true }).click()
  const editor = form(page, t.emRapidReport)
  await editor.getByRole('combobox', { name: t.emBuilding, exact: true }).selectOption(dorm)
  await editor.getByLabel(t.emReportTitle).fill(title)
  await expect(editor.locator('input[type="file"]')).toHaveCount(0)
  await editor.getByRole('button', { name: t.emCreateReport }).click()
  await expect(workspace(page).getByRole('heading', { name: title, exact: true })).toBeVisible()
}

async function confirm(page: Page, name: string) {
  const card = workspace(page).locator('.em-card').filter({
    has: page.getByRole('button', { name: new RegExp(`^${name}`) }),
  })
  await card.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  const editor = card.locator('form').filter({ has: page.locator('select[name="status"]') })
  await editor.getByLabel(t.emPersonStatus).selectOption('at_assembly')
  await editor.getByRole('combobox', { name: t.emAssemblyPoint, exact: true }).selectOption('point-jacaranda')
  await editor.getByLabel(t.emConfirmationNote).fill('Physically seen in this synthetic test')
  await editor.getByRole('button', { name: t.emConfirmPerson }).click()
}

async function confirmAll(page: Page) {
  for (const name of ['Sample student A', 'Sample student B', 'Sample staff member', 'Sample visitor']) {
    await confirm(page, name)
  }
}

async function fillFields(editor: Locator, fields: Record<string, string>) {
  for (const [label, text] of Object.entries(fields)) await editor.getByLabel(label, { exact: true }).fill(text)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: t.emEmergencyShortcut }).click()
})

test('photo-free reports keep failures explicit and survive navigation until reset', async ({ page }) => {
  const calls: string[] = []
  page.on('request', request => { if (request.url().includes('/api/v1/')) calls.push(request.url()) })
  await expect(workspace(page).getByText(t.emWarning)).toBeVisible()
  await report(page, 'No duty configured', 'cedar')
  await expect(workspace(page).getByText(t.emNothingDispatched)).toBeVisible()
  await expect(workspace(page).getByText(t.emFailed, { exact: true })).toHaveCount(2)
  await expect(workspace(page).getByText(t.emEmptyRosterWarning)).toBeVisible()
  const assign = form(page, t.emAssignResponders)
  await assign.getByRole('button', { name: t.emAssignResponders }).click()
  await workspace(page).getByRole('button', { name: t.emAcknowledge }).click()
  await expect(workspace(page).getByText(t.emAcknowledgementNotSafety)).toBeVisible()
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Findings/ }).click()
  await page.getByRole('button', { name: t.emEmergencyShortcut }).click()
  await expect(workspace(page).getByRole('heading', { name: 'No duty configured' })).toBeVisible()
  await page.getByRole('button', { name: t.reset, exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: t.confirm, exact: true }).click()
  await expect(workspace(page).getByText(t.emNoIncidents)).toBeVisible()
  expect(calls).toEqual([])
})

test('simulation escalates to backup and administrators cannot acknowledge as responders', async ({ page }) => {
  await report(page)
  await workspace(page).getByRole('button', { name: /^Advance simulation/ }).click()
  await expect(workspace(page).getByText(t.emEscalated, { exact: true })).toBeVisible()
  await expect(workspace(page).getByText(t.emQueued, { exact: true })).toHaveCount(1)
  await workspace(page).getByRole('button', { name: /^Advance simulation/ }).click()
  await expect(workspace(page).getByText(t.emFailed, { exact: true })).toBeVisible()
  await workspace(page).getByLabel(t.emSimulatedRole).selectOption('administrator')
  await workspace(page).getByRole('button', { name: /^Synthetic rapid incident/ }).click()
  await expect(workspace(page).getByRole('button', { name: t.emAcknowledge })).toHaveCount(0)
  await workspace(page).getByLabel(t.emSimulatedRole).selectOption('officer')
  await expect(tab(page, t.emSetup)).toHaveCount(0)
  await expect(tab(page, t.emDrills)).toHaveCount(0)
  await expect(tab(page, t.emRecovery)).toHaveCount(0)
})

test('temporary absence remains unaccounted and confirmations retain time, location and source', async ({ page }) => {
  await report(page)
  const visitor = workspace(page).locator('.em-card').filter({
    has: page.getByRole('button', { name: /^Sample visitor/ }),
  })
  await expect(visitor).toContainText(t.emUnaccounted)
  await visitor.getByRole('button').click()
  await expect(visitor).toContainText(t.emTemporaryAbsence)
  await expect(visitor).toContainText(t.emExpectedReturn)
  await expect(visitor).toContainText(t.emNeverConfirmed)
  await visitor.getByRole('button', { name: /^Sample visitor/ }).click()
  await confirm(page, 'Sample visitor')
  await visitor.getByRole('button', { name: /^Sample visitor/ }).click()
  await expect(visitor).toContainText(t.emAssembly)
  await expect(visitor).toContainText(t.emConfirmedBy)
  await expect(visitor).toContainText('Physically seen in this synthetic test')
  await expect(visitor).not.toContainText(t.emNeverConfirmed)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
  expect(overflow).toBe(false)
  await expect(visitor).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(visitor).toHaveCSS('background-color', 'rgb(11, 13, 16)')
  await expect(visitor).toHaveCSS('border-top-color', 'rgb(36, 87, 138)')
})

test('guardian handover requires an approved recipient and physical identity check; reopening is separate', async ({ page }) => {
  await workspace(page).getByLabel(t.emSimulatedRole).selectOption('administrator')
  await tab(page, t.emSetup).click()
  const guardian = form(page, t.emAddGuardian)
  await fillFields(guardian, { [t.emGuardianName]: 'Synthetic guardian', [t.emApprovalNote]: 'Synthetic school approval' })
  await guardian.getByLabel(t.emRecordSchoolApproval).check()
  await guardian.getByRole('button', { name: t.emAddGuardian }).click()
  await report(page)
  await workspace(page).getByRole('button', { name: t.emMoveRecovery }).click()
  await workspace(page).getByRole('button', { name: t.emCloseIncident }).click()
  await expect(workspace(page).getByText(t.emPeopleBlock)).toBeVisible()
  await confirmAll(page)
  const student = workspace(page).locator('.em-card').filter({
    has: page.getByRole('button', { name: /^Sample student A/ }),
  })
  await student.getByRole('button', { name: /^Sample student A/ }).click()
  const handover = student.locator('form').filter({ has: page.getByRole('heading', { name: t.emGuardianHandover }) })
  await handover.getByLabel(t.emAuthorisedGuardian).selectOption({ label: 'Synthetic guardian' })
  await handover.getByLabel(t.emVerificationNote).fill('Synthetic staff verification')
  await handover.getByRole('button', { name: t.emRecordHandover }).click()
  await expect(student).not.toContainText(t.emReleased)
  await handover.getByLabel(t.emIdentityChecked).check()
  await handover.getByRole('button', { name: t.emRecordHandover }).click()
  await expect(student).toContainText(t.emReleased)
  const recovery = form(page, t.emRecoveryPlan)
  await fillFields(recovery, { [t.emAccommodation]: 'Synthetic alternate dorm', [t.emWelfare]: 'Synthetic welfare',
    [t.emLearning]: 'Synthetic lessons' })
  await recovery.getByRole('button', { name: t.emSaveRecovery }).click()
  await expect(workspace(page).getByText(t.emReopeningUnapproved, { exact: true })).toBeVisible()
  await workspace(page).getByRole('button', { name: t.emCloseIncident }).click()
  await expect(workspace(page).getByText(t.emApprovalRequired)).toBeVisible()
  const approval = workspace(page).locator('form').filter({ has: page.locator('textarea[name="decision"]') })
  await approval.getByLabel(t.emAuthorisedDecision).check()
  await approval.getByLabel(t.emDecisionNote).fill('Synthetic independent reopening decision')
  await approval.getByRole('button', { name: t.emApproveReopening }).click()
  await expect(workspace(page).locator('.em-card').filter({ hasText: t.emDecisionRecorded }))
    .toContainText('Synthetic independent reopening decision')
  await tab(page, t.emRoster).click()
  const occupant = form(page, t.emAddOccupant)
  await occupant.getByLabel(t.emPersonName).fill('New expected synthetic visitor')
  await occupant.getByRole('button', { name: t.emAddOccupant }).click()
  await tab(page, t.emIncidents).click()
  await workspace(page).getByRole('button', { name: /^Synthetic rapid incident/ }).click()
  await expect(workspace(page).getByText(t.emReopeningUnapproved, { exact: true })).toBeVisible()
  await workspace(page).getByRole('button', { name: t.emCloseIncident }).click()
  await expect(workspace(page).getByText(t.emPeopleBlock)).toBeVisible()
})

test('drills remain distinct, cover night and communication scenarios, and require improvement closure', async ({ page }) => {
  await tab(page, t.emDrills).click()
  const drill = form(page, t.emPlanDrill)
  await fillFields(drill, { [t.emReportTitle]: 'Synthetic supervised drill', [t.emExercisePlan]: 'Safe supervised exercise',
    [t.emApprovalNote]: 'Synthetic school drill approval' })
  for (const label of [t.emNightScenario, t.emCommunicationsScenario, t.emAssistanceScenario]) await drill.getByLabel(label).check()
  await drill.getByRole('button', { name: t.emCreateDrill }).click()
  await expect(workspace(page).getByText(t.emDrillWarning, { exact: false })).toBeVisible()
  await workspace(page).getByRole('button', { name: t.emStartDrill }).click()
  await confirmAll(page)
  const task = workspace(page).locator('form').filter({ has: page.locator('textarea[name="observation"]') })
  await fillFields(task, { [t.emObservation]: 'Backup communications needed clarification', [t.emImprovementAction]: 'Brief backup staff' })
  await task.getByRole('button', { name: t.emAddImprovement }).click()
  await workspace(page).getByRole('button', { name: t.emMoveRecovery }).click()
  await workspace(page).getByRole('button', { name: t.emCloseIncident }).click()
  await expect(workspace(page).getByText(t.emTasksBlock)).toBeVisible()
  await expect(workspace(page).getByRole('button', { name: t.emApproveReopening })).toHaveCount(0)
  await expect(workspace(page).getByRole('button', { name: t.emRecordHandover })).toHaveCount(0)
  await workspace(page).getByRole('button', { name: t.emCompleteTask }).click()
  await workspace(page).getByRole('button', { name: t.emCloseIncident }).click()
  await expect(workspace(page).getByText(`${t.emClosed} · ${t.emDrill}`, { exact: true })).toBeVisible()
})

test('overnight shifts support dated incoming handovers and reject duplicates', async ({ page }) => {
  await tab(page, t.emDuty).click()
  await expect(workspace(page).getByText(t.emSampleDutyNote)).toBeVisible()
  const next = new Date(`${SAMPLE_DAY}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const day = next.toISOString().slice(0, 10)
  const shift = form(page, t.emAddShift)
  await fillFields(shift, { [t.emShiftStart]: `${day}T06:00`, [t.emShiftEnd]: `${day}T14:00`,
    [t.emApprovalNote]: 'Synthetic incoming duty approval' })
  await shift.getByRole('button', { name: t.emAddShift }).click()
  await expect(workspace(page).getByText(t.emShiftRecorded)).toBeVisible()
  const handover = form(page, t.emDutyHandover)
  const incoming = await handover.locator('select[name="incoming"] option').last().getAttribute('value')
  await handover.getByLabel(t.emIncomingShift).selectOption(incoming!)
  await handover.getByLabel(t.emHandoverNote).fill('Review checks, risks and individual assistance')
  await handover.getByRole('button', { name: t.emRecordDutyHandover }).click()
  await workspace(page).getByRole('button', { name: t.emAcceptHandover }).click()
  await expect(workspace(page).getByText(t.emHandoverAccepted)).toBeVisible()
  await handover.getByRole('button', { name: t.emRecordDutyHandover }).click()
  await expect(workspace(page).getByText(t.emHandoverInvalid)).toBeVisible()
})

test('only approved sample contacts are shown and no dialling is offered', async ({ page }) => {
  await workspace(page).getByLabel(t.emSimulatedRole).selectOption('administrator')
  await tab(page, t.emSetup).click()
  const contact = form(page, t.emAddContact)
  await fillFields(contact, { [t.emContactName]: 'Unapproved synthetic contact', [t.emPhone]: '000000',
    [t.emContactPurpose]: 'Synthetic test', [t.emApprovalNote]: 'Not approved' })
  await contact.getByRole('button', { name: t.emAddContact }).click()
  await tab(page, t.emContacts).click()
  await expect(workspace(page).getByText(t.emNoApprovedContacts)).toBeVisible()
  await expect(workspace(page).getByText('Unapproved synthetic contact')).toHaveCount(0)
  await tab(page, t.emSetup).click()
  await fillFields(contact, { [t.emContactName]: 'Approved synthetic contact', [t.emPhone]: '000000',
    [t.emContactPurpose]: 'Synthetic test', [t.emApprovalNote]: 'Synthetic school approval' })
  await contact.getByLabel(t.emRecordSchoolApproval).check()
  await contact.getByRole('button', { name: t.emAddContact }).click()
  await tab(page, t.emContacts).click()
  await expect(workspace(page).getByText('Approved synthetic contact')).toBeVisible()
  await expect(workspace(page).locator('a[href^="tel:"]')).toHaveCount(0)
})

test('confirmed people do not override unresolved high or critical building findings', async ({ page }) => {
  await workspace(page).getByLabel(t.emSimulatedRole).selectOption('administrator')
  await tab(page, t.emSetup).click()
  const point = form(page, t.emAddPoint)
  await point.getByRole('combobox', { name: t.emBuilding, exact: true }).selectOption('cedar')
  await point.getByLabel(t.emPointName).fill('Synthetic Cedar assembly')
  await point.getByRole('button', { name: t.emAddPoint }).click()
  await tab(page, t.emRoster).click()
  const occupant = form(page, t.emAddOccupant)
  await occupant.getByRole('combobox', { name: t.emBuilding, exact: true }).selectOption('cedar')
  await occupant.getByLabel(t.emPersonName).fill('Synthetic Cedar staff')
  await occupant.getByRole('button', { name: t.emAddOccupant }).click()
  await report(page, 'Synthetic Cedar incident', 'cedar')
  const card = workspace(page).locator('.em-card').filter({
    has: page.getByRole('button', { name: /^Synthetic Cedar staff/ }),
  })
  await card.getByRole('button').click()
  await card.getByLabel(t.emPersonStatus).selectOption('at_assembly')
  await card.getByRole('combobox', { name: t.emAssemblyPoint, exact: true }).selectOption({ label: 'Synthetic Cedar assembly' })
  await card.getByLabel(t.emConfirmationNote).fill('Physically confirmed in synthetic test')
  await card.getByRole('button', { name: t.emConfirmPerson }).click()
  await workspace(page).getByRole('button', { name: t.emMoveRecovery }).click()
  const recovery = form(page, t.emRecoveryPlan)
  await fillFields(recovery, { [t.emAccommodation]: 'Synthetic alternate dorm', [t.emWelfare]: 'Synthetic welfare',
    [t.emLearning]: 'Synthetic lessons' })
  await recovery.getByRole('button', { name: t.emSaveRecovery }).click()
  const approval = workspace(page).locator('form').filter({ has: page.locator('textarea[name="decision"]') })
  await approval.getByLabel(t.emAuthorisedDecision).check()
  await approval.getByLabel(t.emDecisionNote).fill('Synthetic attempted decision')
  await approval.getByRole('button', { name: t.emApproveReopening }).click()
  await expect(workspace(page).getByText(t.emFindingsBlock)).toBeVisible()
  await expect(workspace(page).getByText(t.emReopeningUnapproved, { exact: true })).toBeVisible()
})
