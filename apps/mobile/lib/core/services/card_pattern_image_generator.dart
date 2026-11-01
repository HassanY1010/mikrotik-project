import 'dart:math' as math;
import 'dart:typed_data';
import 'package:image/image.dart' as img;

/// Raster image generator for luxury patterns used in PDF printing
class CardPatternImageGenerator {
  /// Generates a PNG overlay byte array for the specified pattern type, dimensions and opacity
  static Uint8List? generatePatternPng({
    required String patternId,
    required int widthPx,
    required int heightPx,
    double opacity = 0.12,
    int strokeColorRgb = 0xFFFFFF,
  }) {
    final cleanId = patternId.toUpperCase();
    if (cleanId == 'NONE' || opacity <= 0.001) return null;

    final image = img.Image(width: widthPx, height: heightPx, numChannels: 4);
    img.fill(image, color: img.ColorRgba8(0, 0, 0, 0)); // transparent background

    final alpha = (opacity.clamp(0.02, 0.4) * 255).toInt();
    final r = (strokeColorRgb >> 16) & 0xFF;
    final g = (strokeColorRgb >> 8) & 0xFF;
    final b = strokeColorRgb & 0xFF;
    final color = img.ColorRgba8(r, g, b, alpha);

    if (cleanId == 'CIRCUIT' || cleanId == 'CIRCUIT_BOARD' || cleanId == 'WIFI_CIRCUIT') {
      _drawCircuit(image, widthPx, heightPx, color);
    } else if (cleanId == 'ISLAMIC' || cleanId == 'ISLAMIC_STAR' || cleanId == 'ARABESQUE') {
      _drawIslamic(image, widthPx, heightPx, color);
    } else if (cleanId == 'CARBON' || cleanId == 'CARBON_FIBER' || cleanId == 'MESH') {
      _drawCarbon(image, widthPx, heightPx, color);
    } else {
      return null;
    }

    return Uint8List.fromList(img.encodePng(image));
  }

  static void _drawCircuit(img.Image image, int width, int height, img.Color color) {
    const spacing = 24;
    final cols = (width / spacing).ceil() + 1;
    final rows = (height / spacing).ceil() + 1;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        final x = c * spacing;
        final y = r * spacing;

        if ((r + c) % 2 == 0) {
          img.drawLine(image, x1: x, y1: y, x2: x + 12, y2: y, color: color);
          img.drawLine(image, x1: x + 12, y1: y, x2: x + 24, y2: y + 12, color: color);
          img.fillCircle(image, x: x, y: y, radius: 2, color: color);
        } else if ((r * c) % 3 == 0) {
          img.drawLine(image, x1: x, y1: y + 12, x2: x + 12, y2: y + 24, color: color);
          img.drawLine(image, x1: x + 12, y1: y + 24, x2: x + 24, y2: y + 24, color: color);
          img.fillCircle(image, x: x + 24, y: y + 24, radius: 2, color: color);
        }
      }
    }
  }

  static void _drawIslamic(img.Image image, int width, int height, img.Color color) {
    const step = 32;
    final cols = (width / step).ceil() + 1;
    final rows = (height / step).ceil() + 1;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        final cx = c * step;
        final cy = r * step;
        const rad = 13;

        // 8-point geometric star vertices
        final points = <math.Point<int>>[];
        for (var i = 0; i < 8; i++) {
          final ang = (i * 45) * math.pi / 180;
          final px = (cx + rad * math.cos(ang)).round();
          final py = (cy + rad * math.sin(ang)).round();
          points.add(math.Point(px, py));
        }

        for (var i = 0; i < 8; i++) {
          final p1 = points[i];
          final p2 = points[(i + 1) % 8];
          img.drawLine(image, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, color: color);
          img.drawLine(image, x1: cx, y1: cy, x2: p1.x, y2: p1.y, color: color);
        }

        // Diamond diagonals
        img.drawLine(image, x1: cx - 16, y1: cy, x2: cx + 16, y2: cy, color: color);
        img.drawLine(image, x1: cx, y1: cy - 16, x2: cx, y2: cy + 16, color: color);
      }
    }
  }

  static void _drawCarbon(img.Image image, int width, int height, img.Color color) {
    const spacing = 8;
    final cols = (width / spacing).ceil() + 1;
    final rows = (height / spacing).ceil() + 1;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        final x = c * spacing + (r % 2 == 1 ? 4 : 0);
        final y = r * spacing;

        img.fillCircle(image, x: x, y: y, radius: 1, color: color);
        if (c % 2 == 0) {
          img.drawLine(image, x1: x - 2, y1: y - 2, x2: x + 2, y2: y + 2, color: color);
        }
      }
    }
  }
}

