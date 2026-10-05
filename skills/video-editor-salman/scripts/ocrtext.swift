import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count > 1, let img = NSImage(contentsOfFile: args[1]),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("{\"error\":\"no image\"}"); exit(1)
}
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.recognitionLanguages = ["en-US","ar-SA"]
req.usesLanguageCorrection = false
let h = VNImageRequestHandler(cgImage: cg, options: [:])
try? h.perform([req])
var out: [[String: Any]] = []
for ob in (req.results ?? []) {
    guard let top = ob.topCandidates(1).first else { continue }
    let b = ob.boundingBox        // 0..1، الأصل أسفل-يسار
    out.append([
        "t": top.string,
        "c": top.confidence,
        "x": b.origin.x, "y": 1 - b.origin.y - b.size.height,
        "w": b.size.width, "h": b.size.height
    ])
}
let d = try! JSONSerialization.data(withJSONObject: out, options: [])
print(String(data: d, encoding: .utf8)!)
