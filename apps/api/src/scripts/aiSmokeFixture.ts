const PNG_64_RED = "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAACMSURBVHhe7dAxAQAgEIDAj2MI+6f4LrpTAYZbGJk995kNg00DGGwawGDTAAabBjDYNIDBpgEMNg1gsGkAg00DGGwawGDTAAabBjDYNIDBpgEMNg1gsGkAg00DGGwawGDTAAabBjDYNIDBpgEMNg1gsGkAg00DGGwawGDTAAabBjDYNIDBpgEMNg1gsPkBYvIOvpJxmAAAAABJRU5ErkJggg==";

export function bedrockSmokeImage() {
  return {
    format: "png" as const,
    bytes: Buffer.from(PNG_64_RED, "base64")
  };
}

export type SmokeCapability = "text" | "vision" | "embedding";

export function smokeCapabilities(args: string[]): SmokeCapability[] {
  const flag = args.find((arg) => arg.startsWith("--capability="));
  if (!flag) return ["text", "vision", "embedding"];
  const capability = flag.slice("--capability=".length);
  return ["text", "vision", "embedding"].includes(capability)
    ? [capability as SmokeCapability]
    : [];
}
