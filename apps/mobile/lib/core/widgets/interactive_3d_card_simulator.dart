import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Interactive 3D Card simulator with touch-drag tilt, holographic foil sheen,
/// and smooth 3D flip between front and back sides.
class Interactive3dCardSimulator extends StatefulWidget {
  final Widget frontChild;
  final Widget backChild;
  final double maxWidth;
  final double minHeight;
  final double borderRadius;
  final bool enableFlipButton;

  const Interactive3dCardSimulator({
    super.key,
    required this.frontChild,
    required this.backChild,
    this.maxWidth = 360,
    this.minHeight = 180,
    this.borderRadius = 16,
    this.enableFlipButton = true,
  });

  @override
  State<Interactive3dCardSimulator> createState() => Interactive3dCardSimulatorState();
}

class Interactive3dCardSimulatorState extends State<Interactive3dCardSimulator>
    with SingleTickerProviderStateMixin {
  // Tilt angles (in radians)
  double _tiltX = 0.0;
  double _tiltY = 0.0;

  // Touch sheen offset (0.0 to 1.0)
  Offset _sheenPosition = const Offset(0.5, 0.5);

  // Flip animation controller (0.0 to 1.0 => 0 to pi radians)
  late AnimationController _flipController;
  late Animation<double> _flipAnimation;

  bool _isBackVisible = false;

  @override
  void initState() {
    super.initState();
    _flipController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );

    _flipAnimation = Tween<double>(begin: 0.0, end: math.pi).animate(
      CurvedAnimation(parent: _flipController, curve: Curves.easeInOutCubic),
    )..addListener(() {
        final shouldShowBack = _flipAnimation.value >= (math.pi / 2);
        if (shouldShowBack != _isBackVisible) {
          setState(() {
            _isBackVisible = shouldShowBack;
          });
        }
      });
  }

  @override
  void dispose() {
    _flipController.dispose();
    super.dispose();
  }

  void flipCard() => _flipCard();
  bool get isBackVisible => _isBackVisible;

  void _flipCard() {
    if (_flipController.isAnimating) return;
    if (_flipController.isCompleted) {
      _flipController.reverse();
    } else {
      _flipController.forward();
    }
  }

  void _onPanUpdate(DragUpdateDetails details, Size size) {
    if (size.width == 0 || size.height == 0) return;

    // Normalizing coordinates from -1.0 to 1.0 relative to center
    final dx = (details.localPosition.dx / size.width - 0.5) * 2;
    final dy = (details.localPosition.dy / size.height - 0.5) * 2;

    setState(() {
      // Limit max tilt to ~18 degrees
      _tiltY = dx.clamp(-1.0, 1.0) * 0.32;
      _tiltX = -dy.clamp(-1.0, 1.0) * 0.32;

      _sheenPosition = Offset(
        (details.localPosition.dx / size.width).clamp(0.0, 1.0),
        (details.localPosition.dy / size.height).clamp(0.0, 1.0),
      );
    });
  }

  void _onPanEnd(DragEndDetails details) {
    // Smooth reset tilt to center
    setState(() {
      _tiltX = 0.0;
      _tiltY = 0.0;
      _sheenPosition = const Offset(0.5, 0.5);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        LayoutBuilder(
          builder: (context, constraints) {
            final effectiveWidth = math.min(constraints.maxWidth, widget.maxWidth);

            return GestureDetector(
              onTap: flipCard,
              onPanUpdate: (details) => _onPanUpdate(details, Size(effectiveWidth, widget.minHeight)),
              onPanEnd: _onPanEnd,
              child: AnimatedBuilder(
                animation: _flipAnimation,
                builder: (context, child) {
                  final flipAngle = _flipAnimation.value;

                  // Perspective transform matrix
                  final transform = Matrix4.identity()
                    ..setEntry(3, 2, 0.0015) // Perspective depth
                    ..rotateX(_tiltX)
                    ..rotateY(_tiltY + flipAngle);

                  return Transform(
                    transform: transform,
                    alignment: Alignment.center,
                    child: Stack(
                      children: [
                        // Card Surface (Front or Back)
                        _isBackVisible
                            ? Transform(
                                transform: Matrix4.identity()..rotateY(math.pi),
                                alignment: Alignment.center,
                                child: widget.backChild,
                              )
                            : widget.frontChild,

                        // Holographic Foil & Light Sheen Effect Overlay
                        Positioned.fill(
                          child: IgnorePointer(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(widget.borderRadius),
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 100),
                                decoration: BoxDecoration(
                                  gradient: RadialGradient(
                                    center: Alignment(
                                      (_sheenPosition.dx - 0.5) * 2.2,
                                      (_sheenPosition.dy - 0.5) * 2.2,
                                    ),
                                    radius: 1.1,
                                    colors: [
                                      Colors.white.withValues(alpha: (_tiltX.abs() + _tiltY.abs()) > 0.03 ? 0.22 : 0.08),
                                      const Color(0xFF00FFCC).withValues(alpha: (_tiltX.abs() + _tiltY.abs()) > 0.05 ? 0.12 : 0.0),
                                      const Color(0xFFFFD700).withValues(alpha: (_tiltX.abs() + _tiltY.abs()) > 0.05 ? 0.08 : 0.0),
                                      Colors.transparent,
                                    ],
                                    stops: const [0.0, 0.35, 0.65, 1.0],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            );
          },
        ),

        if (widget.enableFlipButton) ...[
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextButton.icon(
                    onPressed: _flipCard,
                    icon: AnimatedRotation(
                      turns: _isBackVisible ? 0.5 : 0.0,
                      duration: const Duration(milliseconds: 300),
                      child: const Icon(Icons.flip_camera_android, size: 16),
                    ),
                    label: Text(
                      _isBackVisible ? 'عرض الوجه الأمامي (بيانات الدخول)' : 'عرض الوجه الخلفي (التعليمات والشروط)',
                      style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold),
                    ),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      backgroundColor: Theme.of(context).cardColor,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20),
                        side: BorderSide(color: Theme.of(context).dividerColor.withValues(alpha: 0.5)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Tooltip(
                    message: 'اسحب الكرت بإصبعك لتجربة التأثير ثلاثي الأبعاد واللمعان',
                    child: Icon(
                      Icons.touch_app,
                      size: 16,
                      color: Theme.of(context).hintColor,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

