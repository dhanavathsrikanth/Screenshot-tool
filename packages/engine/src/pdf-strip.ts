import { degrees, drawImage, type PDFDocument, type PDFPage } from "pdf-lib";

export function drawLosslessStrip(
  document: PDFDocument,
  page: PDFPage,
  png: Buffer,
  placement: { x: number; y: number; width: number; height: number },
): void {
  if (png.toString("ascii", 12, 16) !== "IHDR" || png[24] !== 8 || png[25] !== 2 || png[28] !== 0) {
    throw new Error("PDF strips must be non-interlaced 8-bit RGB PNGs");
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const chunks: Buffer[] = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset);
    if (offset + length + 12 > png.length) throw new Error("Invalid PNG strip chunk");
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === "IEND") break;
  }
  if (!chunks.length) throw new Error("PNG strip has no image data");
  const image = document.context.register(document.context.stream(Buffer.concat(chunks), {
    Type: "XObject",
    Subtype: "Image",
    Width: width,
    Height: height,
    BitsPerComponent: 8,
    ColorSpace: "DeviceRGB",
    Filter: "FlateDecode",
    DecodeParms: { Predictor: 15, Colors: 3, BitsPerComponent: 8, Columns: width },
  }));
  const name = page.node.newXObject("Image", image);
  page.pushOperators(...drawImage(name, {
    ...placement,
    rotate: degrees(0),
    xSkew: degrees(0),
    ySkew: degrees(0),
  }));
}
