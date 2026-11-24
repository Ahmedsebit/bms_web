import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { initialFindings, sortFindings } from '../src/data'

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', {
    name: new RegExp(`^${name}(?:\\s|$)`),
  }).click()
}

test.beforeEach(async ({ page }) => { await page.goto('/') })

test('displays Wallinde branding with surface-specific red accents and loaded logo assets', async ({ page }) => {
  await expect(page).toHaveTitle('Wallinde | School Safety & Assurance')
  const mobile = page.getByRole('button', { name: 'Open navigation' })
  if (await mobile.isVisible()) {
    const icon = page.getByRole('img', { name: 'Wallinde', exact: true })
    await expect(icon).toBeVisible()
    await expect(icon).toHaveJSProperty('naturalWidth', 200)
    await mobile.click()
  }
  const brand = page.getByRole('link', { name: 'Wallinde. School Safety & Assurance. Every check counts.' })
  await expect(brand).toBeVisible()
  await expect(brand.locator('img')).toHaveJSProperty('naturalWidth', 552)
  await expect(page.locator('.sidebar')).toHaveCSS('background-color', 'rgb(17, 17, 17)')
  await expect(page.locator('.nav-item.active')).toHaveCSS('box-shadow', 'rgb(230, 57, 70) 3px 0px 0px 0px inset')
  if (await mobile.isVisible()) await page.locator('.nav-item.active').click()
  await expect(page.locator('.prototype-banner')).toHaveCSS('border-top-color', 'rgb(200, 16, 46)')
  await page.getByRole('button', { name: 'Report a finding', exact: true }).click()
  const report = page.getByRole('dialog', { name: 'Report a finding', exact: true })
  await expect(report).toHaveCSS('border-top-color', 'rgb(200, 16, 46)')
  await expect(report.locator('.button.primary')).toHaveCSS('background-color', 'rgb(200, 16, 46)')
  const favicon = await page.request.get('/favicon.png')
  expect(favicon.ok()).toBe(true)
  expect(favicon.headers()['content-type']).toContain('image/png')
})

test('labels the prototype and scopes counts and dormitory reasons', async ({ page }) => {
  await expect(page.getByText('Sample data only.', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'A clear view of every dormitory.' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Filter by dormitory' }).selectOption('cedar')
  await expect(page.locator('.metric-card').filter({ hasText: 'Open findings' })).toContainText('01')
  await page.getByRole('button', { name: 'View details: Cedar House', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Cedar House' })
  await expect(dialog.getByText('Critical action required', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: /Emergency exit obstructed/ }).click()
  await expect(page.getByRole('dialog', { name: 'F-1042', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('colours each dormitory row by assurance state and retains emphasis on hover and focus', async ({ page }) => {
  const samples = [
    { name: 'Cedar House', headline: 'Critical action required', colour: 'rgb(165, 43, 37)' },
    { name: 'Acacia House', headline: 'High-priority attention', colour: 'rgb(255, 230, 0)' },
    { name: 'Baobab House', headline: 'Incomplete assurance', colour: 'rgb(36, 87, 138)' },
    { name: 'Fig House', headline: 'Attention required', colour: 'rgb(255, 240, 74)' },
    { name: 'Palm House', headline: 'No known issues', colour: 'rgb(29, 104, 72)' },
  ]
  for (const view of ['Overview', 'Dormitories']) {
    if (view === 'Dormitories') await navigate(page, view)
    for (const sample of samples) {
      const row = page.getByRole('row').filter({
        has: page.getByRole('button', { name: `View details: ${sample.name}`, exact: true }),
      })
      await expect(row).toHaveCSS('background-color', sample.colour)
      const cell = row.locator('td').first()
      await expect(cell).toHaveCSS('background-color', 'rgb(11, 13, 16)')
      if (await row.evaluate(el => getComputedStyle(el).display === 'grid')) {
        await expect(row).toHaveCSS('border-top-color', sample.colour)
        await expect(row).toHaveCSS('border-left-width', '6px')
      } else {
        await expect(cell).toHaveCSS('border-top-color', sample.colour)
        await expect(cell).toHaveCSS('border-left-width', '6px')
        await expect(row.locator('td').last()).toHaveCSS('border-bottom-width', '6px')
      }
      await expect(row.getByText(sample.headline, { exact: true })).toBeVisible()
    }
  }
  const critical = page.getByRole('row').filter({
    has: page.getByRole('button', { name: 'View details: Cedar House', exact: true }),
  })
  await critical.hover()
  await expect(critical).toHaveCSS('background-color', 'rgb(142, 33, 28)')
  await expect(critical.locator('td').first()).toHaveCSS('background-color', 'rgb(32, 36, 33)')
  await page.mouse.move(0, 0)
  await critical.getByRole('button').first().focus()
  await expect(critical).toHaveCSS('background-color', 'rgb(142, 33, 28)')
  const outlined = await critical.evaluate(el => getComputedStyle(el).display === 'grid')
    ? critical : critical.locator('td').first()
  await expect(outlined).toHaveCSS('border-top-color', 'rgb(165, 43, 37)')
  const count = critical.locator('.count-button')
  await count.hover()
  await expect(count).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.12)')
  await expect(count).toHaveCSS('color', 'rgb(255, 255, 255)')
})

test('filters findings and handles empty results', async ({ page }) => {
  await navigate(page, 'Findings')
  await page.getByRole('combobox', { name: 'Filter by severity' }).selectOption('critical')
  await expect(page.getByRole('button', { name: 'Emergency exit obstructed', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Corridor lighting needs attention', exact: true })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Search findings or locations' }).fill('no such sample finding')
  await expect(page.getByRole('heading', { name: 'Nothing matches these filters.' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByRole('button', { name: 'Emergency exit obstructed', exact: true })).toBeVisible()
})

test('colours each finding row by severity and retains emphasis on hover and focus', async ({ page }) => {
  const critical = page.getByRole('row').filter({
    has: page.getByRole('button', { name: 'Emergency exit obstructed', exact: true }),
  })
  await expect(critical).toHaveCSS('background-color', 'rgb(165, 43, 37)')
  await navigate(page, 'Findings')
  const samples = [
    { title: 'Emergency exit obstructed', severity: 'Critical', colour: 'rgb(165, 43, 37)' },
    { title: 'Extinguisher pressure below range', severity: 'High', colour: 'rgb(255, 230, 0)' },
    { title: 'Corridor lighting needs attention', severity: 'Medium', colour: 'rgb(255, 240, 74)' },
    { title: 'Door identification label missing', severity: 'Low', colour: 'rgb(29, 104, 72)' },
  ]
  for (const sample of samples) {
    const row = page.getByRole('row').filter({
      has: page.getByRole('button', { name: sample.title, exact: true }),
    })
    await expect(row).toHaveCSS('background-color', sample.colour)
    await expect(row.locator('td').first()).toHaveCSS('background-color', 'rgb(11, 13, 16)')
    if (await row.evaluate(el => getComputedStyle(el).display === 'grid')) {
      await expect(row).toHaveCSS('border-left-color', sample.colour)
      await expect(row).toHaveCSS('border-right-width', '6px')
    } else {
      await expect(row.locator('td').first()).toHaveCSS('border-left-color', sample.colour)
      await expect(row.locator('td').last()).toHaveCSS('border-right-width', '6px')
    }
    await expect(row.getByText(sample.severity, { exact: true })).toBeVisible()
  }
  await critical.hover()
  await expect(critical).toHaveCSS('background-color', 'rgb(142, 33, 28)')
  await page.mouse.move(0, 0)
  await critical.getByRole('button', { name: 'Emergency exit obstructed', exact: true }).focus()
  await expect(critical).toHaveCSS('background-color', 'rgb(142, 33, 28)')
  await expect(critical.locator('td').first()).toHaveCSS('background-color', 'rgb(32, 36, 33)')
})

test('puts assigned critical risks ahead of unassigned minor issues and overdue work ahead of other findings', () => {
  const critical = { ...initialFindings[0], action: initialFindings[1].action }
  const ordered = sortFindings([initialFindings[5], initialFindings[3], initialFindings[1], critical])
  expect(ordered.map(finding => finding.id)).toEqual(['F-1042', 'F-1041', 'F-1039', 'F-1037'])
})

test('keeps urgent shortcuts first and scopes my work and overdue work honestly', async ({ page }) => {
  const urgent = page.getByRole('button', { name: /Review critical risks/ })
  await expect(urgent).toBeVisible()
  const queue = await page.locator('.queue-panel').boundingBox()
  const metrics = await page.locator('.metric-grid').boundingBox()
  expect(queue!.y).toBeLessThan(metrics!.y)
  await urgent.click()
  await expect(page.getByRole('combobox', { name: 'Filter by severity' })).toHaveValue('critical')
  await expect(page.getByRole('button', { name: 'Emergency exit obstructed', exact: true })).toBeVisible()
  await navigate(page, 'Overview')
  await page.getByRole('button', { name: /My corrective actions/ }).click()
  await expect(page.getByText('Only my corrective actions', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Corridor lighting needs attention', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Extinguisher pressure below range', exact: true })).toHaveCount(0)
  await navigate(page, 'Overview')
  await page.getByRole('button', { name: /Resolve overdue work/ }).click()
  await expect(page.getByText('Only overdue corrective actions', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Extinguisher pressure below range', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Emergency exit obstructed', exact: true })).toBeVisible()
})

test('keeps record information together on mobile and supports row activation without breaking nested actions', async ({ page }) => {
  const palm = page.locator('.dorm-row').filter({ hasText: 'Palm House' })
  await expect(palm).toContainText('No known issues')
  await expect(palm).toContainText('1 check remaining')
  await palm.locator('td').nth(1).click()
  await expect(page.getByRole('dialog', { name: 'Palm House' })).toContainText('1 check remaining')
  await page.keyboard.press('Escape')
  const row = page.locator('.finding-row').filter({ hasText: 'Emergency exit obstructed' })
  if (await row.evaluate(el => getComputedStyle(el).display === 'grid')) {
    for (const table of await page.locator('.table-scroll').all()) {
      expect(await table.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
    await expect(row.locator('[data-label="Action owner"]')).toBeVisible()
    await expect(row.locator('[data-label="Status"]')).toBeVisible()
    expect(await row.locator('.finding-title').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16)
  }
  await row.locator('td').nth(1).click()
  await expect(page.getByRole('dialog', { name: 'F-1042', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await palm.locator('.count-button').click()
  await expect(page.getByRole('combobox', { name: 'Filter by dormitory' })).toHaveValue('palm')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('keeps urgent actions and record fields accessible on narrow screens', async ({ page }) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width)
    const urgent = await page.getByRole('button', { name: /Review critical risks/ }).boundingBox()
    expect(urgent!.y + urgent!.height).toBeLessThan(844)
    for (const record of await page.locator('.finding-row,.dorm-row').all()) {
      expect(await record.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      await expect(record.locator('td').nth(2)).toHaveCSS('display', 'block')
    }
  }
})

test('uses black interiors, white text and coloured outlines across summary and queue cards', async ({ page }) => {
  const cards = [
    ['.metric-blue', 'rgb(36, 87, 138)'],
    ['.metric-green', 'rgb(29, 104, 72)'],
    ['.metric-red', 'rgb(165, 43, 37)'],
    ['.metric-yellow', 'rgb(255, 230, 0)'],
    ['.queue-amber', 'rgb(255, 230, 0)'],
    ['.queue-blue', 'rgb(36, 87, 138)'],
    ['.independent-card', 'rgb(36, 87, 138)'],
  ]
  for (const [selector, colour] of cards) {
    for (const card of await page.locator(selector).all()) {
      await expect(card).toHaveCSS('background-color', 'rgb(11, 13, 16)')
      await expect(card).toHaveCSS('color', 'rgb(255, 255, 255)')
      await expect(card).toHaveCSS('border-top-color', colour)
      await expect(card).toHaveCSS('border-top-width', '6px')
    }
  }
  await page.locator('.metric-yellow').click()
  await expect(page.getByRole('heading', { name: 'Close the loop, independently.', exact: true })).toBeVisible()
})

test('assigns a finding and independently verifies another action', async ({ page }) => {
  await navigate(page, 'Findings')
  await page.getByRole('button', { name: 'Emergency exit obstructed', exact: true }).click()
  const assign = page.getByRole('dialog', { name: 'F-1042', exact: true })
  await assign.getByLabel('Corrective action', { exact: true }).fill('Clear the route and check normal opening.')
  await assign.getByRole('combobox', { name: 'Action owner', exact: true }).selectOption('officer-a')
  await assign.getByRole('button', { name: 'Assign action', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Sample action assigned')
  await navigate(page, 'Verification')
  await page.getByRole('button', { name: 'External locking mechanism removed', exact: true }).click()
  const verify = page.getByRole('dialog', { name: 'F-1039', exact: true })
  await verify.getByLabel('Note', { exact: true }).fill('Door opening checked independently against the sample completion.')
  await verify.getByRole('button', { name: 'Verify closure', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Sample finding verified and closed.')
  await expect(page.getByRole('button', { name: 'External locking mechanism removed', exact: true })).toHaveCount(0)
  await navigate(page, 'Findings')
  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('verified_closed')
  await page.getByRole('button', { name: 'External locking mechanism removed', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('Verified findings are closed and cannot be edited.')).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Verify closure', exact: true })).toHaveCount(0)
})

test('prevents self-verification and supports returning another completion', async ({ page }) => {
  await navigate(page, 'Verification')
  await page.getByRole('button', { name: 'Exit sign repositioned', exact: true }).click()
  const self = page.getByRole('dialog', { name: 'F-1038', exact: true })
  await expect(self.getByText('You completed this action. Another supervisor must verify or reject it.')).toBeVisible()
  await expect(self.getByRole('button', { name: 'Verify closure', exact: true })).toHaveCount(0)
  await expect(self.getByRole('button', { name: 'Return for more work', exact: true })).toHaveCount(0)
  await self.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'External locking mechanism removed', exact: true }).click()
  const other = page.getByRole('dialog', { name: 'F-1039', exact: true })
  await other.getByLabel('Note', { exact: true }).fill('Please add another sample view of the door operation.')
  await other.getByRole('button', { name: 'Return for more work', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Sample action returned to its owner.')
  await navigate(page, 'Findings')
  await page.getByRole('button', { name: 'External locking mechanism removed', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('Please add another sample view of the door operation.')).toBeVisible()
})

test('reports a sample finding, completes owned work and resets local changes', async ({ page }) => {
  await page.getByRole('button', { name: 'Report a finding', exact: true }).click()
  const report = page.getByRole('dialog', { name: 'Report a finding', exact: true })
  await report.getByLabel('Finding title', { exact: true }).fill('Sample exit handle check')
  await report.getByLabel('Location', { exact: true }).fill('West wing, exit 03')
  await report.getByLabel('Description', { exact: true }).fill('Synthetic observation for the prototype.')
  await report.getByLabel('Include a simulated finding photo').check()
  await report.getByRole('button', { name: 'Save sample finding', exact: true }).click()
  await navigate(page, 'Findings')
  await expect(page.getByRole('button', { name: 'Sample exit handle check', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Corridor lighting needs attention', exact: true }).click()
  const complete = page.getByRole('dialog', { name: 'F-1040', exact: true })
  await complete.getByLabel('Note', { exact: true }).fill('Sample lights restored and checked.')
  await complete.getByRole('button', { name: 'Mark action completed', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Another supervisor must verify')
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reset sample changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sample exit handle check', exact: true })).toHaveCount(0)
})

test('stays within the viewport and keeps keyboard focus inside dialogs', async ({ page }) => {
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate(el => el.clientWidth))
  await page.getByRole('button', { name: 'Report a finding', exact: true }).click()
  const dialog = page.getByRole('dialog')
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Report a finding', exact: true })).toBeFocused()
  await page.getByRole('heading', { name: 'A clear view of every dormitory.' }).click()
  await page.screenshot({ path: `test-results/dashboard-${test.info().project.name}.png`, fullPage: true })
})
