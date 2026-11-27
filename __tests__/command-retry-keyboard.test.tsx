import { fireEvent, render, screen } from '@testing-library/react';
import { Command } from 'cmdk';
import { stopCommandItemActivation } from '@/cmdk/command-interaction';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: jest.fn(),
  });
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
});

it('keeps Enter on the retry button from selecting a command result', () => {
  const retry = jest.fn();
  const selectResult = jest.fn();
  render(<Command>
    <Command.Input value="result" onValueChange={() => undefined} />
    <Command.List>
      <div>
        <button type="button" onClick={retry} onKeyDown={stopCommandItemActivation}>
          Try again
        </button>
      </div>
      <Command.Item value="result" onSelect={selectResult}>
        Result
      </Command.Item>
    </Command.List>
  </Command>);

  fireEvent.keyDown(screen.getByRole('button', { name: 'Try again' }), {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
  });

  expect(selectResult).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledTimes(1);
});
