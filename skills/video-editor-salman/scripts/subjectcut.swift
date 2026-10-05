// قصّ «الموضوع» من صورة (أي شي: شخص، جرة، أسد…) بمكتبة Vision — subjectcut <in> <out.png> [--keep]
// --keep: بمقاس الصورة الأصلي وبنفس المكان (طبقة أشخاص تتحرك فوق صورتهم)
// ⛔ يشيل زجاج المرآة والأوراق الملصوقة عليه — المرآة تُعرض كاملة لا مقصوصة
// يطلع PNG شفاف مقصوص على حدود الموضوع + حافة ورق بيضاء اختيارية تنرسم بالكود
import Foundation
import Vision
import CoreImage
let a = CommandLine.arguments
guard a.count >= 3 else { print("usage: subjectcut <in> <out.png> [--keep]"); exit(2) }
let keep = a.contains("--keep")
let img = CIImage(contentsOf: URL(fileURLWithPath: a[1]))!
let req = VNGenerateForegroundInstanceMaskRequest()
let h = VNImageRequestHandler(ciImage: img, options: [:])
try h.perform([req])
guard let r = req.results?.first else { print("no subject"); exit(3) }
let buf = try r.generateMaskedImage(ofInstances: r.allInstances, from: h, croppedToInstancesExtent: !keep)
let out = CIImage(cvPixelBuffer: buf)
let ctx = CIContext()
try ctx.writePNGRepresentation(of: out, to: URL(fileURLWithPath: a[2]), format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
print("ok \(Int(out.extent.width))x\(Int(out.extent.height)) instances=\(r.allInstances.count)")
