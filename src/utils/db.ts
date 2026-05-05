export function getPrimaryKey(columns: any[]): string | null {
  const pk = columns.find((c: any) => c.pk === 1 || c.pk === true);
  return pk ? pk.name : null;
}
