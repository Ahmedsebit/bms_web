import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { liveT as t } from '../src/liveStrings'

function fixture(canApprove = false) {
  return {
    school: { name: 'Synthetic live school', schoolCode: 'LIVE' },
    buildings: [{ id: 'building-a', name: 'Synthetic live dormitory', highRisks: canApprove ? 0 : 2, openFindings: 3 }],
    emergency: {
      serverTime: new Date().toISOString(), notificationMode: 'in_app_prototype',
      buildings: [{ id: 'building-a', name: 'Synthetic live dormitory' }],
      incidents: [{
        id: 'incident-a', revision: 3, title: 'Synthetic live incident', hazard: 'other',
        status: 'recovery', canLead: false, canAccount: false, canApprove,
        buildingId: 'building-a', accountability: { unaccounted: 0, needs_assistance: 0, at_assembly: 1 }, responseOwnerId: 'responder-a',
      }],
      staff: [{ id: 'responder-a', name: 'Synthetic responder', status: 'active', role: 'officer' }],
      coverage: [{ buildingId: 'building-a', kind: 'coverage_gap' }],
      rosterReviews: [{ buildingId: 'building-a', current: true, expectedCount: 1 }],
      recovery: [{
        id: 'recovery-a', revision: 2, incidentId: 'incident-a', authoredBy: 'another-person',
        accommodation: 'Synthetic accommodation', welfare: 'Synthetic welfare', learningContinuity: 'Synthetic continuity',
      }],
    },
  }
}

async function signIn(page: Page) {
  await page.goto('/live')
  await page.getByLabel(t.password, { exact: true }).fill('Synthetic live password!')
  await page.getByRole('button', { name: t.signIn, exact: true }).click()
  await expect(page.getByText('Synthetic live school', { exact: false })).toBeVisible()
}

test('live oversight requires sign-in and clears records on reload', async ({ page }) => {
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    const data = path.endsWith('/sign-in') ? {
      user: { id: 'lead-a', name: 'Synthetic leadership', role: 'leadership', mustChangePassword: false },
      interactiveCredential: { token: 'synthetic-web-token' },
    } : path.endsWith('/leadership') ? fixture() : { items: [] }
    await route.fulfill({ json: { data } })
  })
  await page.goto('/live')
  await expect(page.getByText('Synthetic live dormitory')).toHaveCount(0)
  await signIn(page)
  await expect(page.getByText('Synthetic live incident', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: t.commands['incident.phase'] })).toHaveCount(0)
  await expect(page.getByRole('button', { name: t.commands['recovery.approve'] })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
  await page.reload()
  await expect(page.getByRole('button', { name: t.signIn, exact: true })).toBeVisible()
  await expect(page.getByText('Synthetic live incident')).toHaveCount(0)
})

test('a separate approved duty enables an explicit online reopening decision', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/commands')) {
      submitted = route.request().postDataJSON()
      await route.fulfill({ json: { data: { approvedAt: new Date().toISOString() } } })
      return
    }
    const data = path.endsWith('/sign-in') ? {
      user: { id: 'lead-a', name: 'Synthetic authorised approver', role: 'leadership', mustChangePassword: false },
      interactiveCredential: { token: 'synthetic-web-token' },
    } : path.endsWith('/leadership') ? fixture(true) : { items: [] }
    await route.fulfill({ json: { data } })
  })
  await signIn(page)
  await page.getByRole('button', { name: t.commands['recovery.approve'] }).click()
  await page.getByLabel(t.fields.authorised).check()
  await page.getByLabel(t.note).fill('Independent synthetic authority decision')
  await page.getByRole('button', { name: t.save }).click()
  await expect(page.getByText(t.saved)).toBeVisible()
  expect(submitted?.command).toBe('recovery.approve')
  expect(submitted?.payload).toMatchObject({
    id: 'recovery-a', expectedRevision: 2, authorised: true,
    note: 'Independent synthetic authority decision', offline: false,
  })
})

test('lost connection retains visibly stale information and disables decisions', async ({ page }) => {
  let offline = false
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/leadership') && offline) {
      await route.fulfill({ status: 502, json: { error: { code: 'BACKEND_UNAVAILABLE' } } })
      return
    }
    const data = path.endsWith('/sign-in') ? {
      user: { id: 'lead-a', name: 'Synthetic approver', role: 'leadership', mustChangePassword: false },
      interactiveCredential: { token: 'synthetic-web-token' },
    } : path.endsWith('/leadership') ? fixture(true) : { items: [] }
    await route.fulfill({ json: { data } })
  })

  await signIn(page)
  offline = true
  await page.getByRole('button', { name: t.refresh }).click()
  await expect(page.getByText(t.unavailable)).toBeVisible()
  await expect(page.getByRole('button', { name: t.commands['recovery.approve'] })).toBeDisabled()
  await expect(page.getByText('Synthetic live incident', { exact: true })).toBeVisible()
})

test('an unowned incident remains prominent across navigation without granting reader authority', async ({ page }) => {
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname
      const snapshot = fixture()
      Object.assign(snapshot.emergency.incidents[0], { status: 'active', responseOwnerId: '', acknowledgedAt: '' })
      const data = path.endsWith('/sign-in') ? {
        user: { id: 'lead-a', name: 'Synthetic reader', role: 'leadership', mustChangePassword: false },
        interactiveCredential: { token: 'synthetic-web-token' },
      } : path.endsWith('/leadership') ? snapshot : { items: [] }
      await route.fulfill({ json: { data } })
    })
    await signIn(page)
    await expect(page.getByText(t.awaitingReceipt, { exact: false })).toBeVisible()
    await page.getByRole('button', { name: t.audit, exact: true }).click()
    await expect(page.getByRole('complementary', { name: t.inbox })).toBeVisible()
    await page.getByRole('complementary', { name: t.inbox }).getByRole('button').click()
    await expect(page.getByRole('heading', { name: 'Synthetic live incident', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: t.commands['incident.accept'] })).toHaveCount(0)
  })

test('response progress stays primary while transfer cancellation remains a secondary action', async ({ page }) => {
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    const snapshot = fixture()
    Object.assign(snapshot.emergency.incidents[0], { status: 'active', responseOwnerId: 'lead-a', canLead: true })
    Object.assign(snapshot.emergency, {
      transfers: [{ id: 'transfer-a', incidentId: 'incident-a', status: 'pending',
        incomingUserId: 'responder-a', requestedBy: 'lead-a' }],
    })
    const data = path.endsWith('/sign-in') ? {
      user: { id: 'lead-a', name: 'Synthetic owner', role: 'supervisor', mustChangePassword: false },
      interactiveCredential: { token: 'synthetic-web-token' },
    } : path.endsWith('/leadership') ? snapshot : { items: [] }
    await route.fulfill({ json: { data } })
  })
  await signIn(page)
  await page.getByRole('button', { name: t.openIncident, exact: true }).click()
  await expect(page.getByRole('button', { name: t.commands['incident.progress'], exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: t.commands['incident.transfer_cancel'], exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: t.actions, exact: true }).click()
  await page.getByRole('button', { name: t.otherActions, exact: true }).click()
  await expect(page.getByRole('button', { name: t.commands['incident.transfer_cancel'], exact: true })).toBeVisible()
})

  test('approval blockers remain visible and prevent submitting a premature reopening decision', async ({ page }) => {
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname
      const snapshot = fixture(true)
      snapshot.emergency.incidents[0].accountability.unaccounted = 1
      const data = path.endsWith('/sign-in') ? {
        user: { id: 'lead-a', name: 'Synthetic approver', role: 'leadership', mustChangePassword: false },
        interactiveCredential: { token: 'synthetic-web-token' },
      } : path.endsWith('/leadership') ? snapshot : { items: [] }
      await route.fulfill({ json: { data } })
    })
    await signIn(page)
    await expect(page.getByRole('button', { name: t.commands['recovery.approve'] })).toBeDisabled()
    await expect(page.getByText(t.errors.PEOPLE_UNACCOUNTED, { exact: true })).toBeVisible()
  })

  test('response transfer collects a complete brief and exposes accessible field errors', async ({ page }) => {
    let submitted: Record<string, unknown> | undefined
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/commands')) {
        submitted = route.request().postDataJSON()
        await route.fulfill({ json: { data: { id: 'transfer-a', status: 'pending' } } })
        return
      }
      const snapshot = fixture()
      Object.assign(snapshot.emergency.incidents[0], { status: 'active', responseOwnerId: 'lead-a', canLead: false })
      const data = path.endsWith('/sign-in') ? {
        user: { id: 'lead-a', name: 'Synthetic owner', role: 'supervisor', mustChangePassword: false },
        interactiveCredential: { token: 'synthetic-web-token' },
      } : path.endsWith('/leadership') ? snapshot : { items: [] }
      await route.fulfill({ json: { data } })
    })
    await signIn(page)
    await page.getByRole('button', { name: t.openIncident, exact: true }).click()
    await page.getByRole('button', { name: t.actions, exact: true }).click()
    await page.getByRole('button', { name: t.otherActions, exact: true }).click()
    await page.getByRole('button', { name: t.commands['incident.transfer'], exact: true }).click()
    await page.getByRole('button', { name: t.save }).click()
    await expect(page.getByRole('heading', { name: t.formErrors })).toBeVisible()
    await expect(page.locator('#live-field-briefRisks')).toHaveAttribute('aria-invalid', 'true')
    await page.getByLabel(t.fields.incomingUserId).selectOption('responder-a')
    for (const key of ['briefSituation', 'briefRisks', 'briefActions', 'briefCommunications']) {
      await page.getByLabel(t.fields[key]).fill(`Synthetic ${key}`)
    }
    await page.getByRole('button', { name: t.save }).click()
    await expect(page.getByText(t.saved)).toBeVisible()
    expect(submitted?.command).toBe('incident.transfer')
    expect(submitted?.payload).toMatchObject({ incomingUserId: 'responder-a', offline: false })
    const payload = submitted?.payload as Record<string, unknown> | undefined
    expect(payload?.note).toContain('Outstanding actions, owners and deadlines:\nSynthetic briefActions')
    expect(payload?.briefSituation).toBeUndefined()
  })
