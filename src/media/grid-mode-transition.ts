export type GridModeCardRect = {
  left: number
  top: number
  width: number
  height: number
}

export type GridModeCardTransition = {
  transform: string
  x: number
  y: number
  scaleX: number
  scaleY: number
}

const isNearlyEqual = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * Invert a card's committed layout back to its previous visual rectangle.
 * The browser can then animate this transform to identity without ever
 * painting the intermediate new layout first.
 */
export const getGridModeCardTransition = (
  previous: GridModeCardRect,
  next: GridModeCardRect,
): GridModeCardTransition | undefined => {
  if (next.width <= 0 || next.height <= 0) { return undefined; }
  const x = previous.left - next.left;
  const y = previous.top - next.top;
  const scaleX = previous.width / next.width;
  const scaleY = previous.height / next.height;
  if (
    Math.abs(x) < 0.5 &&
    Math.abs(y) < 0.5 &&
    isNearlyEqual(scaleX, 1) &&
    isNearlyEqual(scaleY, 1)
  ) { return undefined; }
  return {
    x,
    y,
    scaleX,
    scaleY,
    transform: `translate3d(${x}px, ${y}px, 0) scale(${scaleX}, ${scaleY})`,
  };
};
