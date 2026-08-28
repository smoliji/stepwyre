export interface ScrollState {
  scrollTop: number;
  follow: boolean;
}

function maxTop(totalRows: number, height: number): number {
  return Math.max(0, totalRows - height);
}

export function scrollBy(
  state: ScrollState,
  delta: number,
  totalRows: number,
  height: number,
): ScrollState {
  const top = Math.min(Math.max(0, state.scrollTop + delta), maxTop(totalRows, height));
  return { scrollTop: top, follow: top === maxTop(totalRows, height) };
}

export function clamp(state: ScrollState, totalRows: number, height: number): ScrollState {
  const top = state.follow
    ? maxTop(totalRows, height)
    : Math.min(state.scrollTop, maxTop(totalRows, height));
  return { scrollTop: top, follow: state.follow };
}
