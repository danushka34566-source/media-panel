import {
  PROCESSING_SETTINGS_DEFAULTS,
  parseProcessingSettings,
} from '@/processing/settings-schema';

describe('processing configuration', () => {
  it('uses safe defaults when no overrides exist', () => {
    expect(parseProcessingSettings({})).toEqual({
      ...PROCESSING_SETTINGS_DEFAULTS,
    });
  });

  it('normalizes toggles and clamps numeric controls', () => {
    const settings = parseProcessingSettings({
      orchestratorEnabled: 'on',
      registrationEnabled: '1',
      videoProcessingEnabled: 'true',
      processorClaimLimit: '99',
      staleProcessingMinutes: '0',
    });
    expect(settings.orchestratorEnabled).toBe(true);
    expect(settings.registrationEnabled).toBe(true);
    expect(settings.videoProcessingEnabled).toBe(true);
    expect(settings.processorClaimLimit).toBe(3);
    expect(settings.staleProcessingMinutes).toBe(1);
  });
});
