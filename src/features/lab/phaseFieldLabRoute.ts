export function isPhaseFieldLabUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, 'https://frume.local');
    return parsed.searchParams.get('lab') === 'phase-field';
  } catch {
    return false;
  }
}
