import { fireEvent, render, screen } from '@testing-library/react';
import ProcessingConfigurationForm from '@/admin/config/ProcessingConfigurationForm';
import { PROCESSING_SETTINGS_DEFAULTS } from '@/processing/settings-schema';

jest.mock('../src/processing/settings-actions', () => ({
  saveProcessingSettingsAction: jest.fn(),
}));

it('requires processor registration before allowing processor-only mode', () => {
  render(<ProcessingConfigurationForm settings={PROCESSING_SETTINGS_DEFAULTS} />);

  const needed = screen.getByRole<HTMLInputElement>('switch', {
    name: 'Processor registration',
  });
  const dependent = screen.getByRole<HTMLInputElement>('switch', {
    name: 'Processor-only registration',
  });

  expect(dependent.disabled).toBe(true);
  fireEvent.click(needed);
  expect(dependent.disabled).toBe(false);
  fireEvent.click(dependent);
  expect(dependent.checked).toBe(true);

  fireEvent.click(needed);
  expect(dependent.disabled).toBe(true);
  expect(dependent.checked).toBe(false);
});
