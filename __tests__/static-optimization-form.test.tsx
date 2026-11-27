import { fireEvent, render, screen } from '@testing-library/react';
import StaticOptimizationForm from '@/admin/config/StaticOptimizationForm';

jest.mock('../src/app/application-settings-actions', () => ({
  saveApplicationSettingsAction: jest.fn(),
}));

it('updates toggles when saved settings change after a refresh', () => {
  const settings = {
    staticMediaPages: false,
    staticMediaOgImages: false,
    staticMediaCategories: false,
    staticMediaCategoryOgImages: false,
  };
  const { rerender } = render(<StaticOptimizationForm settings={settings} />);
  const mediaPages = screen.getByRole<HTMLInputElement>('switch', {
    name: 'Media pages',
  });
  const categoryPages = screen.getByRole<HTMLInputElement>('switch', {
    name: 'Category pages',
  });

  fireEvent.click(mediaPages);
  rerender(<StaticOptimizationForm settings={{ ...settings }} />);
  expect(mediaPages.checked).toBe(true);
  expect(categoryPages.checked).toBe(false);

  rerender(<StaticOptimizationForm settings={{
    ...settings,
    staticMediaCategories: true,
  }} />);
  expect(mediaPages.checked).toBe(false);
  expect(categoryPages.checked).toBe(true);
});
