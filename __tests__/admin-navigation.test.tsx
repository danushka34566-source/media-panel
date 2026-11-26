import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SelectMediaProvider from '@/admin/select/SelectMediaProvider';
import { useSelectMediaState } from '@/admin/select/SelectMediaState';
import { pathForProcessingPage } from '@/admin/processing/path';

jest.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useRouter: () => ({}),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
jest.mock('../src/app/AppState', () => ({ useAppState: () => ({ canEdit: true }) }));
jest.mock('../src/utility/dom', () => ({ isElementPartiallyInViewport: () => true }));

function Grid() {
  const { startSelectingMedia, stopSelectingMedia, isSelectingMedia } = useSelectMediaState();
  return <div data-photo-grid="true">
    <button onClick={startSelectingMedia}>Select</button>
    <button onClick={stopSelectingMedia}>Done</button>
    <span>{isSelectingMedia ? 'Selecting' : 'Browsing'}</span>
  </div>;
}

describe('admin navigation', () => {
  it('keeps both processing table pages in each pagination link', () => {
    expect(pathForProcessingPage(3, 2)).toBe('/admin/processing?registrationPage=3&processingPage=2');
    expect(pathForProcessingPage(1, 2)).toBe('/admin/processing?processingPage=2');
    expect(pathForProcessingPage(3, 1)).toBe('/admin/processing?registrationPage=3');
    expect(pathForProcessingPage(1, 1)).toBe('/admin/processing');
  });

  it('closes selection by returning to the original filtered grid entry', async () => {
    window.history.replaceState(null, '', '/search?query=cars#results');
    const grid = () => <SelectMediaProvider><Grid /></SelectMediaProvider>;
    const page = render(grid());
    fireEvent.click(screen.getByText('Select'));
    expect(window.location.search).toBe('?query=cars&select=true');
    expect(window.location.hash).toBe('#results');
    page.rerender(grid());
    expect(screen.getByText('Selecting')).toBeTruthy();
    fireEvent.click(screen.getByText('Done'));
    await waitFor(() => expect(window.location.search).toBe('?query=cars'));
    page.rerender(grid());
    expect(screen.getByText('Browsing')).toBeTruthy();
    window.history.forward();
    await waitFor(() => expect(window.location.search).toBe('?query=cars&select=true'));
    page.rerender(grid());
    expect(screen.getByText('Selecting')).toBeTruthy();
  });

  it('closes a selection deep link without adding another history entry', () => {
    window.history.replaceState(null, '', '/search?select=true&query=cars#results');
    const length = window.history.length;
    render(<SelectMediaProvider><Grid /></SelectMediaProvider>);
    fireEvent.click(screen.getByText('Done'));
    expect(window.location.search).toBe('?query=cars');
    expect(window.location.hash).toBe('#results');
    expect(window.history.length).toBe(length);
  });
});
