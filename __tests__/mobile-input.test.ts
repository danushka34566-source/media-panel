import { sriLankaMobileDigits } from '@/components/SriLankaMobileInput';

describe('Sri Lankan mobile input', () => {
  it('shows only the nine national digits after +94', () => {
    expect(sriLankaMobileDigits('+94712345678')).toBe('712345678');
    expect(sriLankaMobileDigits('0712345678')).toBe('712345678');
    expect(sriLankaMobileDigits('712345678')).toBe('712345678');
  });

  it('removes non-digits and limits input to nine digits', () => {
    expect(sriLankaMobileDigits('71 234-5678 extra')).toBe('712345678');
    expect(sriLankaMobileDigits('712345678999')).toBe('712345678');
  });
});
