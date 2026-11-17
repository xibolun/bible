// Put source Chinese senses first; the complete unchanged entry remains available.
export function chineseMeaning(definition: string) {
  const match = definition.match(/(?:^|\n)(\s*1[)）][\s\S]*)/);
  return match ? match[1].trim() : definition.trim();
}
