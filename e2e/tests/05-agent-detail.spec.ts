import { test, expect } from '../fixtures/test-data.fixture';
import { selectors } from '../helpers/selectors';
import { ApiHelper } from '../helpers/api-helpers';

test.describe('Agent Detail Page', () => {
  test('loads and displays agent name', async ({ page, testData, request }) => {
    testData.createAgent('Detail Agent', 'agent', 'Detail agent test');
    const api = new ApiHelper(request);
    const agents = await api.getAgents();
    const agent = agents.find((a: any) => a.name === 'Detail Agent');
    expect(agent).toBeTruthy();

    await page.goto(`/agents/${agent.id}`);
    // Use header h1 to avoid conflict with markdown preview h1
    await expect(page.locator('header h1')).toContainText('Detail Agent');
  });

  test('displays agent type badge', async ({ page, testData, request }) => {
    testData.createAgent('Badge Detail', 'skill', 'Badge detail test');
    const api = new ApiHelper(request);
    const agents = await api.getAgents();
    // Skills get name from frontmatter which uses the dirName (lowercase-hyphenated)
    const agent = agents.find((a: any) => a.type === 'skill' && a.name.includes('badge-detail'));
    expect(agent).toBeTruthy();

    await page.goto(`/agents/${agent.id}`);
    await expect(page.getByText('skill', { exact: true })).toBeVisible();
  });

  test('shows file path info', async ({ page, testData, request }) => {
    testData.createAgent('Path Info', 'agent', 'Path test');
    const api = new ApiHelper(request);
    const agents = await api.getAgents();
    const agent = agents.find((a: any) => a.name === 'Path Info');

    await page.goto(`/agents/${agent.id}`);
    // Should show the file path (e.g., path-info/AGENTS.md)
    await expect(page.getByText(/AGENTS\.md/)).toBeVisible();
  });

  test('Edit tab is active by default', async ({ page, testData, request }) => {
    testData.createAgent('Edit Tab', 'agent', 'Edit tab test');
    const api = new ApiHelper(request);
    const agents = await api.getAgents();
    const agent = agents.find((a: any) => a.name === 'Edit Tab');

    await page.goto(`/agents/${agent.id}`);
    const editTab = page.locator(selectors.agentDetail.editTab);
    await expect(editTab).toHaveClass(/bg-primary/);
  });

  test('can switch to Files tab', async ({ page, testData, request }) => {
    testData.createAgent('Files Tab', 'agent', 'Files tab test');
    const api = new ApiHelper(request);
    const agents = await api.getAgents();
    const agent = agents.find((a: any) => a.name === 'Files Tab');

    await page.goto(`/agents/${agent.id}`);
    await page.locator(selectors.agentDetail.filesTab).click();
    await expect(page.locator(selectors.agentDetail.filesTab)).toHaveClass(/bg-primary/);
    // Files tab shows directory info
    await expect(page.getByText('Files in')).toBeVisible();
  });

  test('can switch to Preview tab', async ({ page, testData, request }) => {
    testData.createAgent('Preview Tab', 'agent', 'Preview tab test');
    const api = new ApiHelper(request);
    const agents = await api.getAgents();
    const agent = agents.find((a: any) => a.name === 'Preview Tab');

    await page.goto(`/agents/${agent.id}`);
    await page.locator(selectors.agentDetail.previewTab).click();
    await expect(page.locator(selectors.agentDetail.previewTab)).toHaveClass(/bg-primary/);
  });

  test('markdown editor is visible in Edit tab', async ({ page, testData, request }) => {
    testData.createAgent('MD Editor', 'agent', 'MD editor test');
    const api = new ApiHelper(request);
    const agents = await api.getAgents();
    const agent = agents.find((a: any) => a.name === 'MD Editor');

    await page.goto(`/agents/${agent.id}`);
    // MDEditor container
    await expect(page.locator(selectors.agentDetail.mdEditor)).toBeVisible({ timeout: 10000 });
  });

  test('skill shows frontmatter editor', async ({ page, testData, request }) => {
    testData.createAgent('Frontmatter Skill', 'skill', 'Frontmatter test');
    const api = new ApiHelper(request);
    const agents = await api.getAgents();
    // Skills get name from frontmatter which uses dirName
    const agent = agents.find((a: any) => a.type === 'skill' && a.name.includes('frontmatter-skill'));
    expect(agent).toBeTruthy();

    await page.goto(`/agents/${agent.id}`);
    await expect(page.getByText('Metadata (Frontmatter)')).toBeVisible({ timeout: 10000 });
  });

  test('save button triggers save and shows success toast', async ({ page, testData, request }) => {
    testData.createAgent('Save Test', 'agent', 'Save test');
    const api = new ApiHelper(request);
    const agents = await api.getAgents();
    const agent = agents.find((a: any) => a.name === 'Save Test');

    await page.goto(`/agents/${agent.id}`);
    await expect(page.locator(selectors.agentDetail.saveBtn)).toBeVisible();

    // Click save
    await page.locator(selectors.agentDetail.saveBtn).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /saved|success/i })).toBeVisible({ timeout: 5000 });
  });

  test('delete button shows confirm and navigates back', async ({ page, testData, request }) => {
    testData.createAgent('Delete Detail', 'agent', 'Delete detail test');
    const api = new ApiHelper(request);
    const agents = await api.getAgents();
    const agent = agents.find((a: any) => a.name === 'Delete Detail');

    await page.goto(`/agents/${agent.id}`);
    await expect(page.locator(selectors.agentDetail.deleteBtn)).toBeVisible();

    // Handle confirm dialog
    page.on('dialog', dialog => dialog.accept());
    await page.locator(selectors.agentDetail.deleteBtn).click();

    // Should navigate back to agents list
    await expect(page).toHaveURL(/\/agents\/?$/, { timeout: 10000 });
  });

  test('back button navigates to previous page', async ({ page, testData, request }) => {
    testData.createAgent('Back Nav', 'agent', 'Back nav test');
    const api = new ApiHelper(request);
    const agents = await api.getAgents();
    const agent = agents.find((a: any) => a.name === 'Back Nav');

    // Navigate from agents list to detail
    await page.goto('/agents');
    await page.waitForTimeout(1000);
    // Use h3 heading to click the card (avoids strict mode with description text)
    await page.locator('h3').filter({ hasText: 'Back Nav' }).click();
    await expect(page).toHaveURL(/\/agents\//);

    // Click back button (ArrowLeft icon button)
    await page.locator('header button').first().click();
    await expect(page).toHaveURL(/\/agents\/?$/);
  });

  test('files tab shows file info', async ({ page, testData, request }) => {
    testData.createAgent('File Info', 'agent', 'File info test');
    const api = new ApiHelper(request);
    const agents = await api.getAgents();
    const agent = agents.find((a: any) => a.name === 'File Info');

    await page.goto(`/agents/${agent.id}`);
    await page.locator(selectors.agentDetail.filesTab).click();

    // Use exact text match for the file name in the Files tab
    await expect(page.getByText('AGENTS.md', { exact: true })).toBeVisible();
    await expect(page.getByText('Main')).toBeVisible();
    await expect(page.getByText(/Directory:/)).toBeVisible();
  });
});
