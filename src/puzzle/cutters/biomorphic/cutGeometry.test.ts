import { describe, expect, it } from 'vitest';
import { distance, flattenEdge, lineContact, project } from './cutGeometry';

describe('curve geometry', () => {
  it('does not flatten a collinear reversing cubic to its endpoints', () => {
    const points = flattenEdge({ id: 'reversing', ownerIds: [], exterior: false, segments: [{
      kind: 'cubic', start: { x: 0.2, y: 0.5 }, end: { x: 0.8, y: 0.5 },
      control1: { x: 1.8, y: 0.5 }, control2: { x: -0.8, y: 0.5 },
    }] }, 0.00001);
    expect(points.length).toBeGreaterThan(4);
    expect(points.some((p, i) => i > 0 && p.x < points[i - 1].x)).toBe(true);
  });
  it('bounds a curved arc approximation against dense evaluations', () => {
    const tolerance = 1e-4;
    const points = flattenEdge({ id: 'arc', ownerIds: [], exterior: false, segments: [{
      kind: 'cubic', start: { x: 0, y: 0 }, end: { x: 1, y: 0 },
      control1: { x: 0, y: 1 }, control2: { x: 1, y: 1 },
    }] }, tolerance);
    for (let i = 0; i <= 1000; i++) {
      const t = i / 1000, p = { x: 3 * (1 - t) * t * t + t ** 3, y: 3 * t * (1 - t) };
      const index = Math.min(points.length - 2, Math.max(0, points.findIndex(q => q.knot >= t) - 1));
      expect(distance(p, project(p, { a: points[index], b: points[index + 1] }).point)).toBeLessThanOrEqual(tolerance);
    }
  });
  it('distinguishes a shared point from an overlapping interval', () => {
    const a = { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } };
    expect(lineContact(a, { a: { x: 1, y: 0 }, b: { x: 2, y: 0 } })?.overlap).toBe(false);
    expect(lineContact(a, { a: { x: 0.8, y: 0 }, b: { x: 0.2, y: 0 } })?.overlap).toBe(true);
  });
});
