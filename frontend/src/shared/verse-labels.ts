export function verseRange(label: string): [number, number] | undefined {
  const match = /^([1-9][0-9]{0,2})([a-z]?)(?:-([1-9][0-9]{0,2}))?$/.exec(
    label,
  );
  if (!match) return;
  const start = +match[1],
    end = +(match[3] || match[1]);
  if (end < start || (match[2] && match[3])) return;
  return [start, end];
}
export function verseNumbers(labels: string[]) {
  const values = new Set<number>();
  for (const label of labels) {
    const span = verseRange(label);
    if (span) for (let n = span[0]; n <= span[1]; n++) values.add(n);
  }
  return [...values].sort((a, b) => a - b);
}
