import { act, fireEvent, render, screen } from '@testing-library/react';
import type { FormEvent } from 'react';
import LoaderButton from '../src/components/primitives/LoaderButton';

const mockConfirmDialog = jest.fn();

jest.mock('../src/app/AppState', () => ({
  useAppState: () => ({ confirmDialog: mockConfirmDialog }),
}));
jest.mock('../src/components/Tooltip', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => children,
}));

beforeEach(() => mockConfirmDialog.mockReset());

const renderSubmit = (confirmText?: string) => {
  const onSubmit = jest.fn((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  });
  render(
    <form onSubmit={onSubmit}>
      <LoaderButton
        type="submit"
        name="intent"
        value="remove"
        confirmText={confirmText}
      >
        Remove
      </LoaderButton>
    </form>,
  );
  return { button: screen.getByRole('button', { name: 'Remove' }), onSubmit };
};

it('submits only after approval and preserves the submitter', async () => {
  let approve: ((approved: boolean) => void) | undefined;
  mockConfirmDialog.mockReturnValue(new Promise<boolean>(resolve => {
    approve = resolve;
  }));
  const { button, onSubmit } = renderSubmit('Remove this item?');

  fireEvent.click(button);
  expect(mockConfirmDialog).toHaveBeenCalledTimes(1);
  expect(onSubmit).not.toHaveBeenCalled();

  await act(async () => { approve?.(true); });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  const [event] = onSubmit.mock.calls[0];
  expect((event.nativeEvent as SubmitEvent).submitter).toBe(button);
});

it('keeps the form unsubmitted after cancellation', async () => {
  mockConfirmDialog.mockResolvedValue(false);
  const { button, onSubmit } = renderSubmit('Remove this item?');

  fireEvent.click(button);
  await Promise.resolve();
  expect(mockConfirmDialog).toHaveBeenCalledTimes(1);
  expect(onSubmit).not.toHaveBeenCalled();
});

it('preserves immediate submission for a button without confirmation', () => {
  const { button, onSubmit } = renderSubmit();

  fireEvent.click(button);
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(mockConfirmDialog).not.toHaveBeenCalled();
});
