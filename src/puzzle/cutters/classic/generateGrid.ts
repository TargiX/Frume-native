import type { Rect } from '../../types/geometry';
import type { PuzzlePieceDefinition } from '../../types/layout';

type GridCell = {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type EdgeShape = -1 | 0 | 1;

type PieceEdges = {
  top: EdgeShape;
  right: EdgeShape;
  bottom: EdgeShape;
  left: EdgeShape;
};

function buildGrid(rows: number, columns: number, boardWidth: number, boardHeight: number): GridCell[] {
  const cellWidth = boardWidth / columns;
  const cellHeight = boardHeight / rows;
  const cells: GridCell[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      cells.push({
        row,
        col,
        x: col * cellWidth,
        y: row * cellHeight,
        width: cellWidth,
        height: cellHeight,
      });
    }
  }

  return cells;
}

function edgeDirection(row: number, col: number, axis: 'horizontal' | 'vertical'): EdgeShape {
  // Stable variation keeps layouts reproducible while avoiding striped tab directions.
  const hash = ((row + 1) * 73856093) ^ ((col + 1) * 19349663) ^ (axis === 'vertical' ? 83492791 : 0);
  return (hash & 1) === 0 ? 1 : -1;
}

function buildPieceEdges(rows: number, columns: number): PieceEdges[][] {
  const horizontalEdges = Array.from({ length: Math.max(0, rows - 1) }, (_, row) =>
    Array.from({ length: columns }, (_, col) => edgeDirection(row, col, 'horizontal')),
  );
  const verticalEdges = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: Math.max(0, columns - 1) }, (_, col) =>
      edgeDirection(row, col, 'vertical'),
    ),
  );

  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, col) => ({
      top: row === 0 ? 0 : (-horizontalEdges[row - 1][col] as EdgeShape),
      right: col === columns - 1 ? 0 : verticalEdges[row][col],
      bottom: row === rows - 1 ? 0 : horizontalEdges[row][col],
      left: col === 0 ? 0 : (-verticalEdges[row][col - 1] as EdgeShape),
    })),
  );
}

function format(value: number): string {
  return Number(value.toFixed(4)).toString();
}

/**
 * Adds one clockwise edge. A positive shape protrudes along the edge's outward
 * normal; the neighboring piece traverses the same curve backwards with -shape.
 */
function appendEdge(
  commands: string[],
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  shape: EdgeShape,
  depth: number,
): void {
  if (shape === 0) {
    commands.push(`L ${format(endX)} ${format(endY)}`);
    return;
  }

  const dx = endX - startX;
  const dy = endY - startY;
  // Paths run clockwise in screen coordinates (where Y grows downward), so
  // the outward normal is the left-hand normal in screen space.
  const normalX = dy / Math.hypot(dx, dy);
  const normalY = -dx / Math.hypot(dx, dy);

  const point = (along: number, outward: number): string => {
    const x = startX + dx * along + normalX * depth * outward * shape;
    const y = startY + dy * along + normalY * depth * outward * shape;
    return `${format(x)} ${format(y)}`;
  };

  commands.push(
    `L ${point(0.39, 0)}`,
    `C ${point(0.43, 0)} ${point(0.455, 0.03)} ${point(0.45, 0.11)}`,
    `C ${point(0.442, 0.22)} ${point(0.35, 0.25)} ${point(0.32, 0.44)}`,
    `C ${point(0.285, 0.67)} ${point(0.38, 1)} ${point(0.5, 1)}`,
    `C ${point(0.62, 1)} ${point(0.715, 0.67)} ${point(0.68, 0.44)}`,
    `C ${point(0.65, 0.25)} ${point(0.558, 0.22)} ${point(0.55, 0.11)}`,
    `C ${point(0.545, 0.03)} ${point(0.57, 0)} ${point(0.61, 0)}`,
    `L ${format(endX)} ${format(endY)}`,
  );
}

function piecePath(cell: GridCell, edges: PieceEdges, tabDepth: number): string {
  const left = cell.x;
  const top = cell.y;
  const right = cell.x + cell.width;
  const bottom = cell.y + cell.height;
  const commands = [`M ${format(left)} ${format(top)}`];

  appendEdge(commands, left, top, right, top, edges.top, tabDepth);
  appendEdge(commands, right, top, right, bottom, edges.right, tabDepth);
  appendEdge(commands, right, bottom, left, bottom, edges.bottom, tabDepth);
  appendEdge(commands, left, bottom, left, top, edges.left, tabDepth);
  commands.push('Z');

  return commands.join(' ');
}

function neighborIds(
  row: number,
  col: number,
  rows: number,
  columns: number,
  idFor: (r: number, c: number) => string,
): string[] {
  const neighbors: string[] = [];
  if (row > 0) neighbors.push(idFor(row - 1, col));
  if (row < rows - 1) neighbors.push(idFor(row + 1, col));
  if (col > 0) neighbors.push(idFor(row, col - 1));
  if (col < columns - 1) neighbors.push(idFor(row, col + 1));
  return neighbors;
}

export function generateClassicGridPieces(
  rows: number,
  columns: number,
  boardWidth: number,
  boardHeight: number,
): PuzzlePieceDefinition[] {
  const cells = buildGrid(rows, columns, boardWidth, boardHeight);
  const idFor = (row: number, col: number) => `classic-${row}-${col}`;
  const pieceEdges = buildPieceEdges(rows, columns);
  const tabDepth = Math.min(boardWidth / columns, boardHeight / rows) * 0.22;

  return cells.map((cell, index) => {
    const edges = pieceEdges[cell.row][cell.col];
    const bounds: Rect = {
      x: cell.x - (edges.left === 1 ? tabDepth : 0),
      y: cell.y - (edges.top === 1 ? tabDepth : 0),
      width:
        cell.width +
        (edges.left === 1 ? tabDepth : 0) +
        (edges.right === 1 ? tabDepth : 0),
      height:
        cell.height +
        (edges.top === 1 ? tabDepth : 0) +
        (edges.bottom === 1 ? tabDepth : 0),
    };

    return {
      id: idFor(cell.row, cell.col),
      index,
      row: cell.row,
      col: cell.col,
      path: piecePath(cell, edges, tabDepth),
      bounds,
      clipRegion: {
        x: bounds.x / boardWidth,
        y: bounds.y / boardHeight,
        width: bounds.width / boardWidth,
        height: bounds.height / boardHeight,
      },
      correctPosition: { x: bounds.x, y: bounds.y },
      correctRotation: 0,
      neighborIds: neighborIds(cell.row, cell.col, rows, columns, idFor),
    };
  });
}
