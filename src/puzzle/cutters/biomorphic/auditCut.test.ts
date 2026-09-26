import { describe, expect, it } from 'vitest';
import crystalTip from '../../../../assets/cuts/crystal-six/4x4/2.json';
import { decodeBakedCut, type BakedCut } from './bakedCut';
import { auditCut } from './auditCut';
import { createBiomorphicTopology } from './generateBiomorphic';
import { splitBoard } from './cutTestFixtures';

describe('auditCut', () => {
  it('reports a pointed Crystal junction separately from a narrow connecting neck', () => {
    const cut = decodeBakedCut(crystalTip as unknown as BakedCut);
    const options = { pinchGap: 0.01, minCornerAngle: 0, flatness: 0.00005 };
    expect(auditCut(cut, options).pinches.length).toBeGreaterThan(0);
    const audit = auditCut(cut, { ...options, separateJunctionTips: true });
    expect(audit.pinches.some(p => p.piece === 9), JSON.stringify({ pinches: audit.pinches, tips: audit.junctionTips })).toBe(false);
    expect(audit.junctionTips.some(p => p.piece === 9)).toBe(true);
    // Two other pieces share a real local cusp; separating the junction must
    // not hide those independent findings.
    expect(audit.pinches.map(p => p.piece)).toEqual([1, 3]);
  });
  it('passes a straight seam', () => {
    const audit = auditCut(
      splitBoard([
        { x: 0.5, y: 0 },
        { x: 0.5, y: 1 },
      ]),
    );
    expect(audit.crossings).toEqual([]);
    expect(audit.pinches).toEqual([]);
    expect(audit.coverage).toBeCloseTo(1, 6);
    expect(audit.clean).toBe(true);
  });

  it('finds a seam that loops back across itself', () => {
    const audit = auditCut(
      splitBoard([
        { x: 0.5, y: 0 },
        { x: 0.5, y: 0.6 },
        { x: 0.7, y: 0.4 },
        { x: 0.3, y: 0.4 },
        { x: 0.5, y: 1 },
      ]),
    );
    expect(audit.crossings.length).toBeGreaterThan(0);
    expect(audit.clean).toBe(false);
  });

  it('finds a finger whose neck is thinner than the gap allowed', () => {
    // A finger of the left piece reaches into the right one through a neck
    // 0.02 wide, then opens into a head 0.2 across.
    const audit = auditCut(
      splitBoard([
        { x: 0.5, y: 0 },
        { x: 0.5, y: 0.45 },
        { x: 0.6, y: 0.45 },
        { x: 0.6, y: 0.35 },
        { x: 0.8, y: 0.35 },
        { x: 0.8, y: 0.57 },
        { x: 0.6, y: 0.57 },
        { x: 0.6, y: 0.47 },
        { x: 0.5, y: 0.47 },
        { x: 0.5, y: 1 },
      ]),
    );
    expect(audit.crossings).toEqual([]);
    expect(audit.pinches.length).toBeGreaterThan(0);
    // Cell side is 0.5, so a 0.02 neck is 0.04 of a cell.
    expect(Math.min(...audit.narrowestPerPiece)).toBeCloseTo(0.04, 2);
  });

  it('keeps a generated Voronoi cut clean', () => {
    const audit = auditCut(createBiomorphicTopology(4, 4, 'audit'));
    expect(audit.crossings).toEqual([]);
    expect(audit.coverage).toBeCloseTo(1, 3);
  });

  it('detects a real crossing even next to a permitted junction', () => {
    const topology = splitBoard([
      { x: 0.5, y: 0 }, { x: 0.51, y: 0.012 },
      { x: 0.5, y: 0.012 }, { x: 0.51, y: 0.002 },
      { x: 0.6, y: 0.3 }, { x: 0.5, y: 1 },
    ]);
    for (const separateJunctionTips of [false, true]) {
      const audit = auditCut(topology, { separateJunctionTips });
      expect(audit.crossings.length).toBeGreaterThan(0);
      expect(audit.clean).toBe(false);
    }
  });

  it('rejects a seam that retraces an earlier segment', () => {
    const audit = auditCut(splitBoard([
      { x: 0.5, y: 0 }, { x: 0.5, y: 0.6 },
      { x: 0.5, y: 0.4 }, { x: 0.6, y: 0.8 }, { x: 0.5, y: 1 },
    ]));
    expect(audit.crossings.length).toBeGreaterThan(0);
    expect(audit.clean).toBe(false);
  });

  it('rejects a non-adjacent contact at a sampled vertex', () => {
    const audit = auditCut(splitBoard([
      { x: 0.5, y: 0 }, { x: 0.5, y: 0.4 },
      { x: 0.7, y: 0.6 }, { x: 0.3, y: 0.6 },
      { x: 0.5, y: 0.4 }, { x: 0.5, y: 1 },
    ]));
    expect(audit.crossings.length).toBeGreaterThan(0);
  });

  it('rejects inconsistent edge ownership even when the outlines look valid', () => {
    const topology = splitBoard([{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }]);
    topology.edges[1].ownerIds = ['left', 'missing'];
    expect(auditCut(topology).clean).toBe(false);
  });

  it('does not certify a crossing from the area sum', () => {
    const audit = auditCut(splitBoard([
      { x: 0.5, y: 0 }, { x: 0.5, y: 0.6 },
      { x: 0.7, y: 0.4 }, { x: 0.3, y: 0.4 }, { x: 0.5, y: 1 },
    ]));
    expect(audit.coverage).toBeCloseTo(1, 10);
    expect(audit.clean).toBe(false);
  });

  it('flags an acute wedge where a seam joins the frame', () => {
    const audit = auditCut(splitBoard([
      { x: 0.5, y: 0 }, { x: 0.9, y: 0.01 }, { x: 0.5, y: 1 },
    ]));
    expect(audit.sharpCorners.some(c => c.angle < 2)).toBe(true);
    expect(audit.clean).toBe(false);
  });

  it('refuses non-finite control points', () => {
    const topology = splitBoard([{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }]);
    topology.edges[1].segments = [{ kind: 'cubic', start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 },
      control1: { x: NaN, y: 0.2 }, control2: { x: 0.5, y: 0.8 } }];
    expect(auditCut(topology).clean).toBe(false);
  });
});
