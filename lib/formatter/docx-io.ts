import JSZip from "jszip";
import { parseXml, serializeXml, type Document } from "./xml";

/** A problem with the uploaded file itself; the message is safe to show to the user. */
export class FormatInputError extends Error {}

/** An opened .docx: parsed XML parts are cached and written back on save; everything else passes through untouched. */
export class DocxPackage {
  private parts = new Map<string, Document>();

  private constructor(private zip: JSZip) {}

  static async load(data: Buffer | Uint8Array | ArrayBuffer): Promise<DocxPackage> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(data);
    } catch {
      throw new FormatInputError("This file is not a valid .docx (it could not be opened as a Word document).");
    }
    if (!zip.file("word/document.xml")) throw new FormatInputError("This file is not a Word document (word/document.xml is missing).");
    return new DocxPackage(zip);
  }

  has(path: string): boolean {
    return !!this.zip.file(path);
  }

  async xml(path: string): Promise<Document> {
    const cached = this.parts.get(path);
    if (cached) return cached;
    const file = this.zip.file(path);
    if (!file) throw new Error(`Missing part ${path}`);
    const doc = parseXml(await file.async("string"));
    this.parts.set(path, doc);
    return doc;
  }

  async text(path: string): Promise<string | null> {
    const file = this.zip.file(path);
    return file ? file.async("string") : null;
  }

  /** Registers a brand-new XML part (caller must also add the content type / relationship if needed). */
  setXml(path: string, doc: Document): void {
    this.parts.set(path, doc);
  }

  async save(): Promise<Buffer> {
    for (const [path, doc] of this.parts) this.zip.file(path, serializeXml(doc));
    return this.zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }
}
