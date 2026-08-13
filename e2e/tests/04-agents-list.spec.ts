import { test, expect } from '../fixtures/test-data.fixture';
import { selectors } from '../helpers/selectors';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Agents List Page', () => {
  test('displays agents page title', async ({ page, testData }) => {
    testData.createAgent('List Agent', 'agent', 'List test');
    await page.goto('/agents');
    await expect(page.locator('main h1')).toContainText('Agents');
  });

  test('displays agent count in subtitle', async ({ page, testData }) => {
    testData.createAgent('Count A', 'agent', 'First');
    testData.createAgent('Count B', 'skill', 'Second');
    await page.goto('/agents');
    await page.waitForTimeout(1000);
    await expect(page.getByText('agents found')).toBeVisible();
  });

  test('grid view is default', async ({ page, testData }) => {
    testData.createAgent('Grid Agent', 'agent', 'Grid test');
    await page.goto('/agents');
    await page.waitForTimeout(1000);
    // Grid view shows cards with grid layout
    await expect(page.locator('.grid')).toBeVisible();
  });

  test('can switch to list view', async ({ page, testData }) => {
    testData.createAgent('List View Agent', 'agent', 'List view test');
    await page.goto('/agents');
    await page.waitForTimeout(1000);

    // Click the list view button (second button in the view toggle group)
    const viewToggle = page.locator('.flex.border');
    await viewToggle.locator('button').nth(1).click();

    // List view shows a table
    await expect(page.locator('table')).toBeVisible();
  });

  test('can switch back to grid view', async ({ page, testData }) => {
    testData.createAgent('Grid Toggle', 'agent', 'Toggle test');
    await page.goto('/agents');
    await page.waitForTimeout(1000);

    // Switch to list view first
    const viewToggle = page.locator('.flex.border');
    await viewToggle.locator('button').nth(1).click();
    await expect(page.locator('table')).toBeVisible();

    // Switch back to grid view
    await viewToggle.locator('button').nth(0).click();
    await expect(page.locator('.grid')).toBeVisible();
  });

  test('agent cards show name and type badge', async ({ page, testData }) => {
    testData.createAgent('Badge Agent', 'agent', 'Badge test');
    testData.createAgent('Badge Skill', 'skill', 'Badge skill test');
    await page.goto('/agents');
    await page.waitForTimeout(1000);

    await expect(page.getByText('Badge Agent')).toBeVisible();
    await expect(page.getByText('Badge Skill')).toBeVisible();
    // Type badges
    const agentBadges = page.getByText('agent');
    const skillBadges = page.getByText('skill');
    expect(await agentBadges.count()).toBeGreaterThanOrEqual(1);
    expect(await skillBadges.count()).toBeGreaterThanOrEqual(1);
  });

  test('search filters agents by name', async ({ page, testData }) => {
    testData.createAgent('Searchable Alpha', 'agent', 'Alpha');
    testData.createAgent('Searchable Beta', 'skill', 'Beta');
    await page.goto('/agents');
    await page.waitForTimeout(1000);

    await page.locator(selectors.agents.search).fill('Alpha');
    await expect(page.getByText('Searchable Alpha')).toBeVisible();
    await expect(page.getByText('Searchable Beta')).not.toBeVisible();
  });

  test('search is case-insensitive', async ({ page, testData }) => {
    testData.createAgent('Case Test', 'agent', 'Case test');
    await page.goto('/agents');
    await page.waitForTimeout(1000);

    await page.locator(selectors.agents.search).fill('CASE TEST');
    await expect(page.locator('main h3').filter({ hasText: 'Case Test' })).toBeVisible();
  });

  test('full-text search matches markdown body', async ({ page, testData }) => {
    testData.createAgent('Body Agent', 'agent', 'Visible desc');
    // 正文写一个独特词（name/description 都不含）
    const dir = testData.createAgent('Body Agent', 'agent', 'Visible desc').dirPath;
    fs.appendFileSync(path.join(dir, 'AGENTS.md'), '\n## Notes\n\nflumox-quasar-secret word\n');
    await page.goto('/agents');
    await page.waitForTimeout(1000);

    // 普通搜索（name/desc）搜不到正文词
    await page.locator(selectors.agents.search).fill('flumox-quasar');
    await expect(page.locator('main h3').filter({ hasText: 'Body Agent' })).not.toBeVisible();

    // 勾选全文 → 服务端正文匹配命中
    await page.getByTestId('agents-fulltext').check();
    await expect(page.locator('main h3').filter({ hasText: 'Body Agent' })).toBeVisible();
  });

  test('clicking agent card navigates to detail page', async ({ page, testData }) => {
    testData.createAgent('Nav Agent', 'agent', 'Nav test');
    await page.goto('/agents');
    await page.waitForTimeout(1000);

    await page.locator('main h3').filter({ hasText: 'Nav Agent' }).click();
    await expect(page).toHaveURL(/\/agents\//);
  });

  test('list view shows Edit link', async ({ page, testData }) => {
    testData.createAgent('Edit Link', 'agent', 'Edit link test');
    await page.goto('/agents');
    await page.waitForTimeout(1000);

    // Switch to list view
    const viewToggle = page.locator('.flex.border');
    await viewToggle.locator('button').nth(1).click();
    await expect(page.locator('table')).toBeVisible();

    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
  });

  test('empty state shows when no agents match search', async ({ page, testData }) => {
    await page.goto('/agents');
    await page.waitForTimeout(1000);

    await page.locator(selectors.agents.search).fill('nonexistent-agent-xyz');
    await expect(page.getByText('No agents found')).toBeVisible();
  });

  test('rescan button refreshes agent list', async ({ page, testData }) => {
    testData.createAgent('Rescan List', 'agent', 'Rescan test');
    await page.goto('/agents');
    await page.waitForTimeout(1000);

    // Click the rescan button (RefreshCw icon button)
    const rescanBtn = page.locator('header button').last();
    await rescanBtn.click();
    await page.waitForTimeout(1500);

    await expect(page.getByText('Rescan List')).toBeVisible();
  });
});
