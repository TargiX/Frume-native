export const CELEBRATION_MOTION = {
  cardDelayMs: 360,
  cardDurationMs: 420,
  confettiDurationMs: 1_500,
  reducedDurationMs: 120,
} as const;

export type ConfettiParticle = {
  left: `${number}%`;
  top: `${number}%`;
  width: number;
  height: number;
  color: string;
  delay: number;
  driftX: number;
  fallY: number;
  rotation: number;
};

const COLORS = ['#e4aa47', '#ec735f', '#68c7cf', '#8c79e8', '#f2d27d'];

export const CONFETTI_PARTICLES: readonly ConfettiParticle[] = [
  { left: '28%', top: '30%', width: 7, height: 15, color: COLORS[0], delay: 0, driftX: -30, fallY: 96, rotation: -150 },
  { left: '34%', top: '24%', width: 8, height: 8, color: COLORS[1], delay: 80, driftX: -18, fallY: 112, rotation: 180 },
  { left: '40%', top: '28%', width: 6, height: 14, color: COLORS[2], delay: 160, driftX: -10, fallY: 88, rotation: -220 },
  { left: '46%', top: '20%', width: 8, height: 12, color: COLORS[3], delay: 40, driftX: -8, fallY: 118, rotation: 210 },
  { left: '53%', top: '22%', width: 7, height: 15, color: COLORS[4], delay: 120, driftX: 8, fallY: 106, rotation: -190 },
  { left: '60%', top: '27%', width: 9, height: 9, color: COLORS[0], delay: 200, driftX: 14, fallY: 92, rotation: 240 },
  { left: '67%', top: '24%', width: 6, height: 14, color: COLORS[1], delay: 60, driftX: 22, fallY: 114, rotation: -210 },
  { left: '73%', top: '31%', width: 8, height: 12, color: COLORS[2], delay: 140, driftX: 30, fallY: 98, rotation: 170 },
  { left: '24%', top: '43%', width: 8, height: 8, color: COLORS[3], delay: 260, driftX: -34, fallY: 76, rotation: 220 },
  { left: '31%', top: '51%', width: 6, height: 15, color: COLORS[4], delay: 340, driftX: -24, fallY: 82, rotation: -180 },
  { left: '38%', top: '57%', width: 8, height: 11, color: COLORS[0], delay: 220, driftX: -14, fallY: 72, rotation: 190 },
  { left: '45%', top: '63%', width: 7, height: 7, color: COLORS[1], delay: 300, driftX: -6, fallY: 64, rotation: -240 },
  { left: '55%', top: '62%', width: 6, height: 14, color: COLORS[2], delay: 180, driftX: 8, fallY: 70, rotation: 210 },
  { left: '63%', top: '57%', width: 9, height: 9, color: COLORS[3], delay: 380, driftX: 18, fallY: 78, rotation: -200 },
  { left: '70%', top: '50%', width: 7, height: 15, color: COLORS[4], delay: 280, driftX: 26, fallY: 84, rotation: 230 },
  { left: '77%', top: '42%', width: 8, height: 10, color: COLORS[0], delay: 100, driftX: 34, fallY: 74, rotation: -170 },
];
