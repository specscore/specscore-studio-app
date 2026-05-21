import { test, expect } from '@playwright/test';

test.describe('Smoke', () => {
    test('app shell renders', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('link', { name: 'SpecScore App' })).toBeVisible();
        await expect(page.getByText('Demo Projects')).toBeVisible();
    });
});
