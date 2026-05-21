import { test, expect } from '@playwright/test';

test('shows the main navigation', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'SpecScore App' })).toBeVisible();
});

test('shows the home page content', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Sign in with GitHub')).toBeVisible();
});
