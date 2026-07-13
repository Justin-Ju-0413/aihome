import { test, expect } from '../fixtures/test-data.fixture';
import { selectors } from '../helpers/selectors';

test.describe('Settings Page', () => {
  test('displays settings page title', async ({ page, testData }) => {
    await page.goto('/settings');
    await expect(page.locator('main h1')).toContainText('Settings');
  });

  test('displays workspace configuration section', async ({ page, testData }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Workspace' })).toBeVisible();
  });

  test('workspace name input is populated', async ({ page, testData }) => {
    await page.goto('/settings');
    const nameInput = page.locator(selectors.settings.workspaceName);
    await expect(nameInput).toBeVisible();
    const value = await nameInput.inputValue();
    expect(value.length).toBeGreaterThan(0);
  });

  test('can modify workspace name', async ({ page, testData }) => {
    await page.goto('/settings');
    const nameInput = page.locator(selectors.settings.workspaceName);
    await nameInput.clear();
    await nameInput.fill('E2E Test Workspace');

    await page.locator(selectors.settings.saveBtn).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /saved|success/i })).toBeVisible({ timeout: 5000 });
  });

  test('displays scan paths section', async ({ page, testData }) => {
    await page.goto('/settings');
    await expect(page.getByText('Scan Paths')).toBeVisible();
    await expect(page.getByText('Directories to scan')).toBeVisible();
  });

  test('can add a new scan path', async ({ page, testData }) => {
    await page.goto('/settings');
    const pathInput = page.locator(selectors.settings.addPathInput);
    await pathInput.fill('/tmp/test-agents-e2e');
    await page.locator(selectors.settings.addPathBtn).click();

    // New path should appear in the list
    await expect(page.getByText('/tmp/test-agents-e2e')).toBeVisible();
  });

  test('can add path with Enter key', async ({ page, testData }) => {
    await page.goto('/settings');
    const pathInput = page.locator(selectors.settings.addPathInput);
    await pathInput.fill('/tmp/enter-path-e2e');
    await pathInput.press('Enter');

    await expect(page.getByText('/tmp/enter-path-e2e')).toBeVisible();
  });

  test('can remove a scan path', async ({ page, testData }) => {
    await page.goto('/settings');
    
    // Add a path first
    const pathInput = page.locator(selectors.settings.addPathInput);
    await pathInput.fill('/tmp/remove-path-e2e');
    await page.locator(selectors.settings.addPathBtn).click();
    await expect(page.getByText('/tmp/remove-path-e2e')).toBeVisible();

    // Remove it by clicking the trash button next to it
    const pathRow = page.locator('.flex.items-center.gap-3').filter({ hasText: '/tmp/remove-path-e2e' });
    await pathRow.locator('button').click();
    await expect(page.getByText('/tmp/remove-path-e2e')).not.toBeVisible();
  });

  test('displays groups section', async ({ page, testData }) => {
    await page.goto('/settings');
    await expect(page.getByText('Groups').first()).toBeVisible();
    await expect(page.getByText('Organize agents into groups')).toBeVisible();
  });

  test('displays default groups', async ({ page, testData }) => {
    await page.goto('/settings');
    // Scope to the Groups section to avoid matching sidebar/path text
    const groupsSection = page.locator('section').filter({ hasText: 'Organize agents' });
    await expect(groupsSection.getByText('Default')).toBeVisible();
    await expect(groupsSection.locator('span').filter({ hasText: /^Agents$/ })).toBeVisible();
    await expect(groupsSection.locator('span').filter({ hasText: /^Skills$/ })).toBeVisible();
  });

  test('can add a new group', async ({ page, testData }) => {
    await page.goto('/settings');
    const groupInput = page.locator(selectors.settings.addGroupInput);
    await groupInput.fill('E2E Test Group');
    await page.locator(selectors.settings.addGroupBtn).click();

    await expect(page.getByText('E2E Test Group')).toBeVisible();
  });

  test('can add group with Enter key', async ({ page, testData }) => {
    await page.goto('/settings');
    const groupInput = page.locator(selectors.settings.addGroupInput);
    await groupInput.fill('Enter Group');
    await groupInput.press('Enter');

    await expect(page.getByText('Enter Group')).toBeVisible();
  });

  test('can remove a custom group', async ({ page, testData }) => {
    await page.goto('/settings');

    // Add a group first
    const groupInput = page.locator(selectors.settings.addGroupInput);
    await groupInput.fill('Removable Group');
    await page.locator(selectors.settings.addGroupBtn).click();
    await expect(page.getByText('Removable Group')).toBeVisible();

    // Remove it
    const groupRow = page.locator('.flex.items-center.gap-3').filter({ hasText: 'Removable Group' });
    await groupRow.locator('button').click();
    await expect(page.getByText('Removable Group')).not.toBeVisible();
  });

  test('color picker is available for new groups', async ({ page, testData }) => {
    await page.goto('/settings');
    // The color picker is a row of small round buttons inside a flex container, next to the group input
    const groupsSection = page.locator('section').filter({ hasText: 'Organize agents' });
    // The color pickers are inside a flex gap-1 container (the row of colors)
    const colorRow = groupsSection.locator('.flex.gap-1');
    await expect(colorRow).toBeVisible();
    const colorButtons = colorRow.locator('button');
    const count = await colorButtons.count();
    expect(count).toBeGreaterThanOrEqual(8); // 8 default colors
  });

  test('save button saves configuration', async ({ page, testData }) => {
    await page.goto('/settings');
    await page.locator(selectors.settings.saveBtn).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /saved|success/i })).toBeVisible({ timeout: 5000 });
  });

  test('rescan button triggers scan', async ({ page, testData }) => {
    await page.goto('/settings');
    await page.locator(selectors.settings.rescanBtn).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /found|agents/i })).toBeVisible({ timeout: 5000 });
  });

  test('About section displays app info', async ({ page, testData }) => {
    await page.goto('/settings');
    await expect(page.getByText('About')).toBeVisible();
    await expect(page.getByText('AIHome - AI Agent Visual Manager')).toBeVisible();
    await expect(page.getByText('Version 1.0.0')).toBeVisible();
  });
});
