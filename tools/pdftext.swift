// PDF text and page images with macOS PDFKit (no poppler needed).
//   swift tools/pdftext.swift a.pdf b.pdf          -> a.txt, b.txt next to each PDF
//   swift tools/pdftext.swift --png 11 a.pdf       -> a-p11.png (page 11 at 200 dpi)
import Foundation
import PDFKit
import AppKit

var args = Array(CommandLine.arguments.dropFirst())
var pngPage: Int? = nil
if args.first == "--png", args.count >= 3 { pngPage = Int(args[1]); args.removeFirst(2) }

for path in args {
    guard let doc = PDFDocument(url: URL(fileURLWithPath: path)) else { print("FAIL \(path)"); continue }
    if doc.isLocked { _ = doc.unlock(withPassword: "") }
    let base = (path as NSString).deletingPathExtension
    if let p = pngPage, let page = doc.page(at: p - 1) {
        let box = page.bounds(for: .mediaBox)
        let scale: CGFloat = 200.0 / 72.0
        let size = NSSize(width: box.width * scale, height: box.height * scale)
        let img = page.thumbnail(of: size, for: .mediaBox)
        if let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
           let png = rep.representation(using: .png, properties: [:]) {
            try? png.write(to: URL(fileURLWithPath: "\(base)-p\(p).png"))
            print("\(base)-p\(p).png")
        }
        continue
    }
    var out = ""
    for i in 0..<doc.pageCount {
        out += "\n===== page \(i + 1) =====\n" + (doc.page(at: i)?.string ?? "")
    }
    try? out.write(toFile: base + ".txt", atomically: true, encoding: .utf8)
    print("\(path): \(doc.pageCount) pages, \(out.count) chars")
}
