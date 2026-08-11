import { describe, expect, it } from 'vitest';

import { isPhaseFieldLabUrl } from './phaseFieldLabRoute';

describe('isPhaseFieldLabUrl', () => {
  it('only selects the explicit phase-field lab route', () => {
    expect(isPhaseFieldLabUrl('http://127.0.0.1:8081/?lab=phase-field')).toBe(true);
    expect(isPhaseFieldLabUrl('http://127.0.0.1:8081/?lab=other')).toBe(false);
    expect(isPhaseFieldLabUrl(undefined)).toBe(false);
  });
});
