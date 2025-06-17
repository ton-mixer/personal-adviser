declare module "pdf-image" {
  export interface PDFImageOptions {
    convertOptions?: Record<string, string>;
    convertExtension?: string;
    outputDirectory?: string;
    combinedImage?: boolean;
  }

  export class PDFImage {
    constructor(pdfFilePath: string, options?: PDFImageOptions);
    convertPage(pageNumber: number): Promise<string>;
    convertFile(): Promise<string>;
  }

  export default PDFImage;
}
