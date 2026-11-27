import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import GlobalError from '../app/global-error';

jest.mock('../src/tag', () => ({ TAG_PRIVATE: 'private' }));

function renderErrorContent(props: ComponentProps<typeof GlobalError>) {
  const documentFallback = GlobalError(props);
  const body = documentFallback.props.children;
  render(body.props.children);
}

it('uses the root error retry supplied by Next', () => {
  const reset = jest.fn();
  const retry = jest.fn();
  renderErrorContent({ reset, unstable_retry: retry });

  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

  expect(retry).toHaveBeenCalledTimes(1);
  expect(reset).not.toHaveBeenCalled();
});

it('uses reset when the root error provides only reset', () => {
  const reset = jest.fn();
  renderErrorContent({ reset });

  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

  expect(reset).toHaveBeenCalledTimes(1);
});
