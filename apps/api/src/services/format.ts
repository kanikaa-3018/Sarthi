export function inferAttribute(question = "") {
  const lower = question.toLowerCase();
  if (lower.includes("transparent") || lower.includes("thin") || lower.includes("see through")) return "transparency";
  if (lower.includes("fabric") || lower.includes("kapda") || lower.includes("material")) return "fabric";
  if (lower.includes("color") || lower.includes("colour")) return "color";
  if (lower.includes("size") || lower.includes("fit") || lower.includes("tight") || lower.includes("loose")) return "size";
  if (lower.includes("pack")) return "packaging";
  if (lower.includes("offer") || lower.includes("price")) return "offer";
  return "fabric";
}

export function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function withoutId(row: any) {
  if (!row) return row;
  const { _id, ...rest } = row;
  return rest;
}
