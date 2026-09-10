// Original vector artwork. Run from the repository root: swift scripts/artwork/render-icon.swift
import AppKit

func render(_ name: String, size: Int, background: Bool, monochrome: Bool = false) {
    let alpha = background ? CGImageAlphaInfo.noneSkipLast : CGImageAlphaInfo.premultipliedLast
    let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: alpha.rawValue)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
    context.scaleBy(x: CGFloat(size) / 1024, y: CGFloat(size) / 1024)
    if background {
        NSColor(srgbRed: 0.10, green: 0.23, blue: 0.22, alpha: 1).setFill()
        NSBezierPath(rect: NSRect(x: 0, y: 0, width: 1024, height: 1024)).fill()
    }
    // Two softly interlocking pieces, suggesting a landscape held together.
    let upper = NSBezierPath()
    upper.move(to: NSPoint(x: 238, y: 534))
    upper.curve(to: NSPoint(x: 786, y: 534), controlPoint1: NSPoint(x: 354, y: 598), controlPoint2: NSPoint(x: 619, y: 426))
    upper.line(to: NSPoint(x: 786, y: 705))
    upper.curve(to: NSPoint(x: 705, y: 786), controlPoint1: NSPoint(x: 786, y: 750), controlPoint2: NSPoint(x: 750, y: 786))
    upper.line(to: NSPoint(x: 319, y: 786))
    upper.curve(to: NSPoint(x: 238, y: 705), controlPoint1: NSPoint(x: 274, y: 786), controlPoint2: NSPoint(x: 238, y: 750))
    upper.close()
    (monochrome ? NSColor.white : NSColor(srgbRed: 0.94, green: 0.84, blue: 0.64, alpha: 1)).setFill(); upper.fill()
    let lower = NSBezierPath()
    lower.move(to: NSPoint(x: 238, y: 508))
    lower.curve(to: NSPoint(x: 786, y: 508), controlPoint1: NSPoint(x: 354, y: 572), controlPoint2: NSPoint(x: 619, y: 400))
    lower.line(to: NSPoint(x: 786, y: 319))
    lower.curve(to: NSPoint(x: 705, y: 238), controlPoint1: NSPoint(x: 786, y: 274), controlPoint2: NSPoint(x: 750, y: 238))
    lower.line(to: NSPoint(x: 319, y: 238))
    lower.curve(to: NSPoint(x: 238, y: 319), controlPoint1: NSPoint(x: 274, y: 238), controlPoint2: NSPoint(x: 238, y: 274))
    lower.close()
    (monochrome ? NSColor.white : NSColor(srgbRed: 0.44, green: 0.64, blue: 0.57, alpha: 1)).setFill(); lower.fill()
    NSGraphicsContext.restoreGraphicsState()
    let bitmap = NSBitmapImageRep(cgImage: context.makeImage()!)
    try! bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "assets/\(name).png"))
}
render("frume-organic-icon", size: 1024, background: true)
render("frume-organic-foreground", size: 1024, background: false)
render("frume-organic-favicon", size: 64, background: true)

render("frume-organic-monochrome", size: 1024, background: false, monochrome: true)
