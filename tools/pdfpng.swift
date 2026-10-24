// Render every page of a PDF to PNG without poppler (PDFKit), e.g. outline drawings and rating charts of a datasheet.
//   swift tools/pdfpng.swift <pdf> <outdir> [scale=2]  → <outdir>/p1.png …
import Foundation
import PDFKit
import AppKit

let a = CommandLine.arguments
let doc = PDFDocument(url: URL(fileURLWithPath: a[1]))!
let out = a[2], s = a.count > 3 ? Double(a[3])! : 2.0
for i in 0..<doc.pageCount {
  let p = doc.page(at: i)!, r = p.bounds(for: .mediaBox)
  let w = Int(r.width * s), h = Int(r.height * s)
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  let ctx = NSGraphicsContext(bitmapImageRep: rep)!
  NSGraphicsContext.current = ctx
  ctx.cgContext.setFillColor(NSColor.white.cgColor); ctx.cgContext.fill(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.cgContext.scaleBy(x: s, y: s)
  p.draw(with: .mediaBox, to: ctx.cgContext)
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(out)/p\(i + 1).png"))
}
