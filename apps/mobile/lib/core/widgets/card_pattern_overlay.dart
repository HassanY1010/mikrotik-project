import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Available luxury & tech pattern overlays for cards
enum CardPatternType {
  none,
  circuitBoard,   // الدوائر الإلكترونية والوايفاي
  islamicStar,    // الفخامة الهندسي والأرابيسك
  carbonFiber,    // النقاط وألياف الكربون
}

extension CardPatternTypeExtension on CardPatternType {
  String get id {
    switch (this) {
      case CardPatternType.none:
        return 'NONE';
      case CardPatternType.circuitBoard:
        return 'CIRCUIT';
      case CardPatternType.islamicStar:
        return 'ISLAMIC';
      case CardPatternType.carbonFiber:
        return 'CARBON';
    }
  }

  String get labelAr {
    switch (this) {
      case CardPatternType.none:
        return 'بدون نمط';
      case CardPatternType.circuitBoard:
        return 'دوائر إلكترونية وWi-Fi';
      case CardPatternType.islamicStar:
        return 'فخامة هندسية (أرابيسك)';
      case CardPatternType.carbonFiber:
        return 'ألياف كربونية (شبكي)';
    }
  }

  IconData get icon {
    switch (this) {
      case CardPatternType.none:
        return Icons.block;
      case CardPatternType.circuitBoard:
        return Icons.developer_board;
      case CardPatternType.islamicStar:
        return Icons.auto_awesome;
      case CardPatternType.carbonFiber:
        return Icons.grid_4x4;
    }
  }

  static CardPatternType fromString(String? val) {
    if (val == null) return CardPatternType.none;
    switch (val.toUpperCase()) {
      case 'CIRCUIT':
      case 'CIRCUIT_BOARD':
      case 'WIFI_CIRCUIT':
        return CardPatternType.circuitBoard;
      case 'ISLAMIC':
      case 'ISLAMIC_STAR':
      case 'ARABESQUE':
        return CardPatternType.islamicStar;
      case 'CARBON':
      case 'CARBON_FIBER':
      case 'MESH':
        return CardPatternType.carbonFiber;
      default:
        return CardPatternType.none;
    }
  }
}

/// CustomPainter that renders luxury, mathematical SVG-like decorative patterns
class CardPatternPainter extends CustomPainter {
  final CardPatternType patternType;
  final double opacity; // 0.05 to 0.25
  final Color strokeColor;

  CardPatternPainter({
    required this.patternType,
    this.opacity = 0.12,
    this.strokeColor = Colors.white,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (patternType == CardPatternType.none || opacity <= 0.001) return;

    final paint = Paint()
      ..color = strokeColor.withValues(alpha: opacity.clamp(0.02, 0.4))
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0
      ..strokeCap = StrokeCap.round;

    final fillPaint = Paint()
      ..color = strokeColor.withValues(alpha: opacity.clamp(0.02, 0.4) * 0.8)
      ..style = PaintingStyle.fill;

    switch (patternType) {
      case CardPatternType.circuitBoard:
        _drawCircuitBoard(canvas, size, paint, fillPaint);
        break;
      case CardPatternType.islamicStar:
        _drawIslamicGeometric(canvas, size, paint);
        break;
      case CardPatternType.carbonFiber:
        _drawCarbonFiber(canvas, size, paint, fillPaint);
        break;
      case CardPatternType.none:
        break;
    }
  }

  void _drawCircuitBoard(Canvas canvas, Size size, Paint linePaint, Paint dotPaint) {
    const spacing = 28.0;
    final cols = (size.width / spacing).ceil() + 1;
    final rows = (size.height / spacing).ceil() + 1;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        final x = c * spacing;
        final y = r * spacing;

        // Draw track
        if ((r + c) % 2 == 0) {
          final path = Path();
          path.moveTo(x, y);
          path.lineTo(x + spacing * 0.5, y);
          path.lineTo(x + spacing, y + spacing * 0.5);
          canvas.drawPath(path, linePaint);

          // Node connector circle
          canvas.drawCircle(Offset(x, y), 2.0, dotPaint);
        } else if ((r * c) % 3 == 0) {
          final path = Path();
          path.moveTo(x, y + spacing * 0.5);
          path.lineTo(x + spacing * 0.5, y + spacing);
          path.lineTo(x + spacing, y + spacing);
          canvas.drawPath(path, linePaint);

          // Node connector circle
          canvas.drawCircle(Offset(x + spacing, y + spacing), 2.2, dotPaint);
        }

        // Concentric Wi-Fi wave pulse in the corner
        if (r == 0 && c == cols - 2) {
          final center = Offset(size.width - 20, 20);
          for (var i = 1; i <= 3; i++) {
            canvas.drawArc(
              Rect.fromCircle(center: center, radius: i * 8.0),
              math.pi * 0.75,
              math.pi * 0.5,
              false,
              linePaint,
            );
          }
        }
      }
    }
  }

  void _drawIslamicGeometric(Canvas canvas, Size size, Paint linePaint) {
    const step = 32.0;
    final cols = (size.width / step).ceil() + 1;
    final rows = (size.height / step).ceil() + 1;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        final cx = c * step;
        final cy = r * step;
        final r1 = step * 0.42;

        // Draw 8-point geometric star mesh
        final p = Path();
        for (var i = 0; i < 8; i++) {
          final angle = (i * 45) * math.pi / 180;
          final x = cx + r1 * math.cos(angle);
          final y = cy + r1 * math.sin(angle);
          if (i == 0) {
            p.moveTo(x, y);
          } else {
            p.lineTo(x, y);
          }
          // Connecting diagonal web
          canvas.drawLine(Offset(cx, cy), Offset(x, y), linePaint);
        }
        p.close();
        canvas.drawPath(p, linePaint);

        // Interlocking diamond diagonals
        canvas.drawLine(
          Offset(cx - step * 0.5, cy),
          Offset(cx + step * 0.5, cy),
          linePaint,
        );
        canvas.drawLine(
          Offset(cx, cy - step * 0.5),
          Offset(cx, cy + step * 0.5),
          linePaint,
        );
      }
    }
  }

  void _drawCarbonFiber(Canvas canvas, Size size, Paint linePaint, Paint fillPaint) {
    const spacing = 10.0;
    final cols = (size.width / spacing).ceil() + 1;
    final rows = (size.height / spacing).ceil() + 1;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        final x = c * spacing + (r % 2 == 1 ? spacing * 0.5 : 0);
        final y = r * spacing;

        // Micro carbon weave dot
        canvas.drawCircle(Offset(x, y), 1.5, fillPaint);

        // Fine diagonal grid lines
        if (c % 2 == 0) {
          canvas.drawLine(
            Offset(x - 2, y - 2),
            Offset(x + 2, y + 2),
            linePaint,
          );
        }
      }
    }
  }

  @override
  bool shouldRepaint(covariant CardPatternPainter oldDelegate) {
    return oldDelegate.patternType != patternType ||
        oldDelegate.opacity != opacity ||
        oldDelegate.strokeColor != strokeColor;
  }
}

