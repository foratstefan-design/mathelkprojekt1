/** CSS-pixel layout budgets; never change question deadlines when a browser resizes. */
export function questionLayout(width, height, density = 0) {
  const short = height < 720 || density > 0;
  return {width, height, density, top: short ? 140 : 172,
    centerY: short ? 90 : 105, size: short ? 80 : 100};
}
/** Pick the first readable density that fits, retaining natural scrolling otherwise. */
export function fitQuestion(measure, apply, initial = 0) {
  let density = initial;
  apply(density);
  while (measure() > 1 && density < 2) apply(++density);
  return density;
}
