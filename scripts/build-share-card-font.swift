// Builds data/share-card-font.bin, the glyph atlas the server uses to draw
// place share cards (1200x630 PNGs) without any image library.
//
// usage: swift scripts/build-share-card-font.swift <Fraunces.ttf> <Nunito.ttf> <out.bin>
//
// The fonts are the variable Fraunces and Nunito from github.com/google/fonts
// (SIL Open Font License, see data/fonts/OFL-*.txt). Only rendered glyph
// coverage (8-bit alpha) and metrics are written, never the font files.
//
// Output (gzip): uint32 LE header length, UTF-8 JSON header, then the alpha
// bytes. Header: { styles: { <name>: { size, ascent, descent, glyphs: {
// <codepoint>: [width, height, left, top, advance, offset] } } },
// sprites: { <name>: [width, height, offset] } }. `left` is the bitmap's x
// offset from the pen, `top` its top edge above the baseline (pixels).
import Foundation
import CoreText
import CoreGraphics

let args = CommandLine.arguments
guard args.count == 4 else { print("usage: build-share-card-font <Fraunces.ttf> <Nunito.ttf> <out.bin>"); exit(1) }

func cgFont(_ path: String) -> CGFont {
  let provider = CGDataProvider(url: URL(fileURLWithPath: path) as CFURL)!
  return CGFont(provider)!
}
func tag(_ s: String) -> Int { s.unicodeScalars.reduce(0) { ($0 << 8) | Int($1.value) } }
func font(_ cg: CGFont, size: CGFloat, axes: [String: Double]) -> CTFont {
  var variations: [NSNumber: NSNumber] = [:]
  for (k, v) in axes { variations[NSNumber(value: tag(k))] = NSNumber(value: v) }
  let desc = CTFontDescriptorCreateWithAttributes([kCTFontVariationAttribute: variations] as CFDictionary)
  return CTFontCreateWithGraphicsFont(cg, size, nil, desc)
}

let fraunces = cgFont(args[1]), nunito = cgFont(args[2])
// Names: three sizes so long names step down before wrapping a third line.
let styles: [(String, CTFont)] = [
  ("name84", font(fraunces, size: 84, axes: ["wght": 700, "opsz": 72, "SOFT": 0, "WONK": 0])),
  ("name68", font(fraunces, size: 68, axes: ["wght": 700, "opsz": 72, "SOFT": 0, "WONK": 0])),
  ("name54", font(fraunces, size: 54, axes: ["wght": 700, "opsz": 72, "SOFT": 0, "WONK": 0])),
  ("wordmark", font(fraunces, size: 34, axes: ["wght": 500, "opsz": 24, "SOFT": 0, "WONK": 0])),
  ("label", font(nunito, size: 26, axes: ["wght": 800])),
  ("small", font(nunito, size: 26, axes: ["wght": 600])),
]

// Latin-1 plus the punctuation and letters place names use.
var codepoints: [UInt32] = Array(32...126) + Array(160...255)
codepoints += [0x2018, 0x2019, 0x201C, 0x201D, 0x2013, 0x2014, 0x2026, 0x2022, 0x2122, 0x0152, 0x0153, 0x0160, 0x0161, 0x017D, 0x017E, 0x0178, 0x0131, 0x0141, 0x0142]

var blob = Data()
var header: [String: Any] = [:]
var styleOut: [String: Any] = [:]

func renderAlpha(width: Int, height: Int, draw: (CGContext) -> Void) -> Data {
  var bytes = [UInt8](repeating: 0, count: width * height)
  bytes.withUnsafeMutableBytes { buf in
    let ctx = CGContext(data: buf.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)!
    ctx.setShouldAntialias(true)
    ctx.setAllowsFontSmoothing(false)
    ctx.setFillColor(gray: 1, alpha: 1)
    ctx.setStrokeColor(gray: 1, alpha: 1)
    draw(ctx)
  }
  // A bitmap context's first row in memory is the top of the image (drawing coordinates are y-up), so rows are already top-down.
  return Data(bytes)
}

for (name, ctFont) in styles {
  var glyphsOut: [String: [Int]] = [:]
  for cp in codepoints {
    guard let scalar = Unicode.Scalar(cp) else { continue }
    var chars = Array(String(Character(scalar)).utf16)
    var glyphs = [CGGlyph](repeating: 0, count: chars.count)
    guard CTFontGetGlyphsForCharacters(ctFont, &chars, &glyphs, chars.count), glyphs[0] != 0 else { continue }
    var g = glyphs[0]
    var advance = CGSize.zero
    CTFontGetAdvancesForGlyphs(ctFont, .horizontal, &g, &advance, 1)
    let box = CTFontGetBoundingRectsForGlyphs(ctFont, .horizontal, &g, nil, 1)
    if box.isEmpty || box.width < 0.5 {
      glyphsOut[String(cp)] = [0, 0, 0, 0, Int(advance.width.rounded()), 0]
      continue
    }
    let left = Int(floor(box.minX)) - 1, bottom = Int(floor(box.minY)) - 1
    let w = Int(ceil(box.maxX)) + 1 - left, h = Int(ceil(box.maxY)) + 1 - bottom
    let data = renderAlpha(width: w, height: h) { ctx in
      var pos = CGPoint(x: CGFloat(-left), y: CGFloat(-bottom))
      CTFontDrawGlyphs(ctFont, &g, &pos, 1, ctx)
    }
    glyphsOut[String(cp)] = [w, h, left, h + bottom, Int(advance.width.rounded()), blob.count]
    blob.append(data)
  }
  styleOut[name] = ["size": Int(CTFontGetSize(ctFont)), "ascent": Int(CTFontGetAscent(ctFont).rounded()), "descent": Int(CTFontGetDescent(ctFont).rounded()), "glyphs": glyphsOut]
}
header["styles"] = styleOut

// The header's mountain mark (okanagan.html: viewBox 0 0 60 24, stroke 1.6), at 2.6x.
let scale: CGFloat = 2.6, mw = Int(60 * scale) + 4, mh = Int(24 * scale) + 4
let mark = renderAlpha(width: mw, height: mh) { ctx in
  ctx.translateBy(x: 2, y: CGFloat(mh) - 2)
  ctx.scaleBy(x: scale, y: -scale)
  ctx.setLineWidth(1.6)
  ctx.setLineCap(.round)
  ctx.setLineJoin(.round)
  for pts in [[(2.0, 20.0), (14, 6), (21, 14), (26, 9), (31, 14)], [(26.0, 20.0), (38, 6), (45, 14), (50, 9), (55, 14)]] {
    ctx.move(to: CGPoint(x: pts[0].0, y: pts[0].1))
    for p in pts.dropFirst() { ctx.addLine(to: CGPoint(x: p.0, y: p.1)) }
    ctx.strokePath()
  }
}
header["sprites"] = ["mark": [mw, mh, blob.count]]
blob.append(mark)

let json = try JSONSerialization.data(withJSONObject: header, options: [.sortedKeys])
var out = Data()
var len = UInt32(json.count).littleEndian
out.append(Data(bytes: &len, count: 4))
out.append(json)
out.append(blob)
try out.write(to: URL(fileURLWithPath: args[3] + ".raw"))
print("glyph atlas: \(blob.count) alpha bytes, header \(json.count) bytes")
