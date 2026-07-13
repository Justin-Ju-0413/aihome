import { test, expect } from '../fixtures/test-data.fixture';
import { selectors } from '../helpers/selectors';
import { ApiHelper } from '../helpers/api-helpers';

test.describe('Board Page - Header & Controls', () => {
  test('displays board title and agent count', async ({ page, testData }) => {
    testData.createAgent('Board Agent', 'agent', 'Test agent');
    await page.goto('/board');
    await expect(page.locator('main h1')).toContainText('Agent Board');
    // Wait for agents to load
    await page.waitForTimeout(1500);
    await expect(page.locator('header p')).toContainText('agents');
  });

  test('search input filters agents by name', async ({ page, testData }) => {
    testData.createAgent('Alpha Bot', 'agent', 'First agent');
    testData.createAgent('Beta Skill', 'skill', 'Second skill');
    await page.goto('/board');
    await page.waitForTimeout(1500);

    const searchInput = page.locator(selectors.board.search);
    await searchInput.fill('Alpha');

    // After filtering, only Alpha Bot should be visible in cards
    await expect(page.locator('main').getByText('Alpha Bot')).toBeVisible();
    await expect(page.locator('main').getByText('Beta Skill')).not.toBeVisible();
  });

  test('filter dropdown changes filter state', async ({ page, testData }) => {
    testData.createAgent('FilterAgent', 'agent', 'An agent');
    testData.createAgent('FilterSkill', 'skill', 'A skill');
    await page.goto('/board');
    await page.waitForTimeout(1500);

    const filter = page.locator(selectors.board.filter);
    // Verify default is 'all'
    await expect(filter).toHaveValue('all');
    
    // Change to skills
    await filter.selectOption('skill');
    await expect(filter).toHaveValue('skill');
    
    // Change to agents
    await filter.selectOption('agent');
    await expect(filter).toHaveValue('agent');
  });

  test('rescan button triggers scan', async ({ page, testData }) => {
    testData.createAgent('Rescan Agent', 'agent', 'Rescan test');
    await page.goto('/board');
    await page.waitForTimeout(1000);

    const rescanBtn = page.locator(selectors.board.rescanBtn);
    await rescanBtn.click();

    // Wait for toast notification
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 5000 });
  });

  test('New Agent button opens create modal', async ({ page, testData }) => {
    await page.goto('/board');
    await page.waitForTimeout(500);

    await page.locator(selectors.board.newAgentBtn).click();
    await expect(page.locator(selectors.modal.createTitle)).toBeVisible();
  });
});

test.describe('Board Page - Kanban Columns', () => {
  test('displays kanban columns for groups', async ({ page, testData }) => {
    testData.createAgent('Column Agent', 'agent', 'Column test');
    await page.goto('/board');
    await page.waitForTimeout(1500);

    // Default groups: Default, Agents, Skills - check in main content area
    // The kanban columns are in the flex container
    const boardArea = page.locator('.flex.gap-6');
    await expect(boardArea.getByText('Default').first()).toBeVisible();
    await expect(boardArea.getByText('Agents').first()).toBeVisible();
    await expect(boardArea.getByText('Skills').first()).toBeVisible();
  });

  test('agent cards display name and type', async ({ page, testData }) => {
    testData.createAgent('CardDisplay', 'agent', 'Card display description');
    await page.goto('/board');
    await page.waitForTimeout(1500);

    // Check card heading specifically
    await expect(page.locator('main h3').filter({ hasText: 'CardDisplay' })).toBeVisible();
  });
});

test.describe('Board Page - Create Modal', () => {
  test.beforeEach(async ({ page, testData }) => {
    await page.goto('/board');
    await page.waitForTimeout(500);
    await page.locator(selectors.board.newAgentBtn).click();
    await expect(page.locator(selectors.modal.createTitle)).toBeVisible();
  });

  test('modal shows type selection buttons', async ({ page }) => {
    // Use more specific locators within the modal
    const modal = page.locator('.fixed.inset-0');
    await expect(modal.getByText('Agent').first()).toBeVisible();
    await expect(modal.getByText('Skill').first()).toBeVisible();
  });

  test('create button is disabled when name is empty', async ({ page }) => {
    const createBtn = page.locator(selectors.modal.createBtn);
    await expect(createBtn).toBeDisabled();
  });

  test('can create a new skill', async ({ page, request }) => {
    // Click the skill type option in the modal
    const modal = page.locator('.fixed.inset-0');
    await modal.locator('button').filter({ hasText: 'Skill' }).click();
    await page.locator(selectors.modal.nameInput).fill('e2e-modal-skill');
    await page.locator(selectors.modal.descInput).fill('Created from modal test');

    const createBtn = page.locator(selectors.modal.createBtn);
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    // Should show success toast
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'created' })).toBeVisible({ timeout: 5000 });

    // Cleanup
    const api = new ApiHelper(request);
    const agents = await api.getAgents();
    const created = agents.find((a: any) => a.name === 'e2e-modal-skill');
    if (created) await api.deleteAgent(created.id);
  });

  test('can create a new agent', async ({ page, request }) => {
    const modal = page.locator('.fixed.inset-0');
    // Click the Agent type card (contains 'AGENTS.md format')
    await modal.locator('button').filter({ hasText: 'AGENTS.md format' }).click();
    await page.locator(selectors.modal.nameInput).fill('e2e-modal-agent');
    await page.locator(selectors.modal.descInput).fill('Created from agent modal test');

    await page.locator(selectors.modal.createBtn).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'created' })).toBeVisible({ timeout: 5000 });

    // Cleanup
    const api = new ApiHelper(request);
    const agents = await api.getAgents();
    const created = agents.find((a: any) => a.name === 'e2e-modal-agent');
    if (created) await api.deleteAgent(created.id);
  });

  test('cancel button closes modal', async ({ page }) => {
    await page.locator(selectors.modal.cancelBtn).click();
    await expect(page.locator(selectors.modal.createTitle)).not.toBeVisible();
  });
});

test.describe('Board Page - Card Detail Modal', () => {
  test('clicking agent card opens detail modal', async ({ page, testData }) => {
    testData.createAgent('DetailCard', 'agent', 'Detail card test');
    await page.goto('/board');
    await page.waitForTimeout(1500);

    // Click the card heading specifically
    await page.locator('main h3').filter({ hasText: 'DetailCard' }).click();
    await expect(page.locator(selectors.cardDetail.container)).toBeVisible();
  });

  test('detail modal shows agent info', async ({ page, testData }) => {
    testData.createAgent('InfoCard', 'skill', 'Info card description');
    await page.goto('/board');
    await page.waitForTimeout(1500);

    await page.locator('main h3').filter({ hasText: 'InfoCard' }).click();
    const modal = page.locator(selectors.cardDetail.container);
    await expect(modal).toContainText('InfoCard');
    await expect(modal).toContainText('skill');
    await expect(modal).toContainText('Description');
  });

  test('Edit button navigates to agent detail page', async ({ page, testData }) => {
    testData.createAgent('EditNavCard', 'agent', 'Edit navigation test');
    await page.goto('/board');
    await page.waitForTimeout(1500);

    await page.locator('main h3').filter({ hasText: 'EditNavCard' }).click();
    await expect(page.locator(selectors.cardDetail.container)).toBeVisible();

    await page.locator(selectors.cardDetail.editBtn).click();
    await expect(page).toHaveURL(/\/agents\//);
  });

  test('Delete button removes agent after confirm', async ({ page, testData }) => {
    testData.createAgent('DeleteMeCard', 'agent', 'To be deleted');
    await page.goto('/board');
    await page.waitForTimeout(1500);

    await page.locator('main h3').filter({ hasText: 'DeleteMeCard' }).click();
    await expect(page.locator(selectors.cardDetail.container)).toBeVisible();

    // Handle confirm dialog
    page.on('dialog', dialog => dialog.accept());
    await page.locator(selectors.cardDetail.deleteBtn).click();

    // Should show success toast and close modal
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'deleted' })).toBeVisible({ timeout: 5000 });
  });

  test('close button closes detail modal', async ({ page, testData }) => {
    testData.createAgent('CloseCard', 'agent', 'Close modal test');
    await page.goto('/board');
    await page.waitForTimeout(1500);

    await page.locator('main h3').filter({ hasText: 'CloseCard' }).click();
    await expect(page.locator(selectors.cardDetail.container)).toBeVisible();

    // Click the X button (first button in the modal header)
    await page.locator(selectors.cardDetail.container).locator('button').first().click();
    await expect(page.locator(selectors.cardDetail.container)).not.toBeVisible();
  });

  test('clicking backdrop closes detail modal', async ({ page, testData }) => {
    testData.createAgent('BackdropCard', 'agent', 'Backdrop test');
    await page.goto('/board');
    await page.waitForTimeout(1500);

    await page.locator('main h3').filter({ hasText: 'BackdropCard' }).click();
    await expect(page.locator(selectors.cardDetail.container)).toBeVisible();

    // Click on the backdrop (the fixed overlay, outside the modal content)
    await page.locator(selectors.cardDetail.container).click({ position: { x: 10, y: 10 } });
    await expect(page.locator(selectors.cardDetail.container)).not.toBeVisible();
  });
});
