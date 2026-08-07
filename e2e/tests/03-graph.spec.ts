import { test, expect } from '../fixtures/test-data.fixture';
import { selectors } from '../helpers/selectors';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Graph Page', () => {
  test('displays graph page title', async ({ page, testData }) => {
    testData.createAgent('Graph Agent', 'agent', 'Graph test');
    await page.goto('/graph');
    await expect(page.locator('main h1')).toContainText('Agent Graph');
  });

  test('displays subtitle about agent relationships', async ({ page, testData }) => {
    await page.goto('/graph');
    await expect(page.getByText('Visualize agent relationships')).toBeVisible();
  });

  test('displays legend with relationship types', async ({ page, testData }) => {
    await page.goto('/graph');
    await expect(page.getByText('Calls')).toBeVisible();
    await expect(page.getByText('Depends')).toBeVisible();
    await expect(page.getByText('Extends')).toBeVisible();
    await expect(page.getByText('References')).toBeVisible();
  });

  test('displays legend with node types', async ({ page, testData }) => {
    await page.goto('/graph');
    // Legend should show Agent and Skill node types
    const legend = page.locator('header');
    await expect(legend.getByText('Agent').last()).toBeVisible();
    await expect(legend.getByText('Skill').last()).toBeVisible();
  });

  test('shows loading state before graph renders', async ({ page, testData }) => {
    // The graph component is dynamically imported, so there may be a brief loading state
    await page.goto('/graph');
    // Either loading text or the react-flow container should appear
    const loadingOrGraph = page.locator(selectors.graph.loading).or(page.locator(selectors.graph.reactFlow));
    await expect(loadingOrGraph).toBeVisible({ timeout: 15000 });
  });

  test('ReactFlow container renders', async ({ page, testData }) => {
    testData.createAgent('Flow Agent', 'agent', 'Flow test');
    await page.goto('/graph');
    // Wait for dynamic import to complete
    // Use count check since ReactFlow may hide itself when empty
    await expect(page.locator(selectors.graph.reactFlow)).toHaveCount(1, { timeout: 15000 });
  });

  test('ReactFlow renders nodes for agents', async ({ page, testData }) => {
    testData.createAgent('Node Agent', 'agent', 'Node test');
    testData.createAgent('Node Skill', 'skill', 'Skill node test');
    await page.goto('/graph');

    // Wait for ReactFlow to render
    await expect(page.locator(selectors.graph.reactFlow)).toHaveCount(1, { timeout: 15000 });
    // Wait for nodes to render
    await page.waitForTimeout(2000);
    // ReactFlow nodes have class .react-flow__node
    const nodes = page.locator('.react-flow__node');
    const nodeCount = await nodes.count();
    expect(nodeCount).toBeGreaterThanOrEqual(1);
  });

  test('ReactFlow controls are rendered', async ({ page, testData }) => {
    testData.createAgent('Controls Agent', 'agent', 'Controls test');
    await page.goto('/graph');

    await expect(page.locator(selectors.graph.reactFlow)).toHaveCount(1, { timeout: 15000 });
    await page.waitForTimeout(1000);
    await expect(page.locator(selectors.graph.controls)).toBeVisible({ timeout: 10000 });
  });

  test('displays hint about creating connections', async ({ page, testData }) => {
    await page.goto('/graph');
    await expect(page.getByText('Drag between nodes to create connections')).toBeVisible();
  });

  test('renders dependency edges between related agents', async ({ page, testData }) => {
    const dep = testData.createAgent('Edge Dependency', 'agent', 'Dependency target');
    const main = testData.createAgent('Edge Main', 'agent', 'Main agent');
    fs.appendFileSync(
      path.join(main.dirPath, 'AGENTS.md'),
      `\n## Dependencies\n\n- Edge Dependency\n`
    );

    await page.goto('/graph');
    await expect(page.locator(selectors.graph.reactFlow)).toHaveCount(1, { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Dependency edges must render as ReactFlow edges
    const edges = page.locator('.react-flow__edge');
    await expect(edges).toHaveCount(1, { timeout: 10000 });
  });
});
