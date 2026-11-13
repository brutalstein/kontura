/** DXF files from Turkish CAD setups are often Windows-1254, not UTF-8; without this, layer names such as "BÜKÜM" arrive garbled and bend lines are missed. */
export function decodeDxf(buf: ArrayBuffer): string {
  const text = new TextDecoder("utf-8").decode(buf);
  return text.includes("�") ? new TextDecoder("windows-1254").decode(buf) : text;
}
