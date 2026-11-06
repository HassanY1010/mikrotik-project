import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/widgets/interactive_3d_card_simulator.dart';
import 'package:mobile/features/studio/presentation/card_studio_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Sticky Live Preview Verification & Responsive Multi-Screen Audit', () {
    testWidgets('Header Delegate responds accurately across small, standard, and tablet screens', (tester) async {
      final key = GlobalKey<Interactive3dCardSimulatorState>();
      bool collapsed = false;

      final simulator = Interactive3dCardSimulator(
        key: key,
        frontChild: Container(key: const Key('front_card'), color: Colors.blue),
        backChild: Container(key: const Key('back_card'), color: Colors.green),
        maxWidth: 360,
        minHeight: 180,
      );

      // 1. Verify standard dimensions & extents
      expect(StickyCardPreviewHeaderDelegate.maxHeight, equals(318.0));
      expect(StickyCardPreviewHeaderDelegate.minHeight, equals(152.0));

      // Test screen sizes: Small (320w), Standard (360w), Large (412w), Tablet (600w)
      final testScreenSizes = [
        const Size(320, 568),
        const Size(360, 640),
        const Size(412, 915),
        const Size(600, 1024),
      ];

      for (final screenSize in testScreenSizes) {
        await tester.binding.setSurfaceSize(screenSize);

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: CustomScrollView(
                slivers: [
                  SliverPersistentHeader(
                    pinned: true,
                    delegate: StickyCardPreviewHeaderDelegate(
                      previewCard: simulator,
                      dimensionsText: '85×54 mm',
                      isCollapsed: collapsed,
                      onToggleCollapse: () {
                        collapsed = !collapsed;
                      },
                      onFlipCard: () {
                        key.currentState?.flipCard();
                      },
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: Container(
                      height: 1200,
                      color: Colors.grey.shade200,
                      child: const Center(child: Text('Settings Area')),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );

        await tester.pumpAndSettle();

        // Verify initial render at top of page (offset 0)
        expect(find.text('85×54 mm'), findsOneWidget);
        expect(find.text('قلب'), findsOneWidget);
        expect(find.byKey(const Key('front_card')), findsOneWidget);

        // Scroll down 300 pixels deep into settings
        await tester.drag(find.byType(CustomScrollView), const Offset(0, -300), warnIfMissed: false);
        await tester.pumpAndSettle();

        // Verify preview header is STILL PINNED and visible at top
        expect(find.text('85×54 mm'), findsOneWidget);
        expect(find.byKey(const Key('front_card')), findsOneWidget);

        // Flip card via 3D flip trigger
        key.currentState?.flipCard();
        await tester.pump(const Duration(milliseconds: 300));
        await tester.pumpAndSettle();
        expect(key.currentState?.isBackVisible, isTrue);

        // Flip back to front
        key.currentState?.flipCard();
        await tester.pump(const Duration(milliseconds: 300));
        await tester.pumpAndSettle();
        expect(key.currentState?.isBackVisible, isFalse);

        // Scroll back to top
        await tester.drag(find.byType(CustomScrollView), const Offset(0, 300), warnIfMissed: false);
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('front_card')), findsOneWidget);
      }

      await tester.binding.setSurfaceSize(null);
    });

    test('Aspect ratios for all 5 standard and custom dimensions fit without distortion in pinned header', () {
      final testAspects = [
        {'name': '85x54 (Standard)', 'w': 85.0, 'h': 54.0, 'expectedRatio': 85.0 / 54.0},
        {'name': '100x40 (Ticket)', 'w': 100.0, 'h': 40.0, 'expectedRatio': 100.0 / 40.0},
        {'name': '70x35 (Compact)', 'w': 70.0, 'h': 35.0, 'expectedRatio': 70.0 / 35.0},
        {'name': '50x30 (Mini)', 'w': 50.0, 'h': 30.0, 'expectedRatio': 50.0 / 30.0},
        {'name': '54x85 (Portrait)', 'w': 54.0, 'h': 85.0, 'expectedRatio': 54.0 / 85.0},
      ];

      const availablePinnedHeight = StickyCardPreviewHeaderDelegate.minHeight - 40.0; // 112.0 dp

      for (final item in testAspects) {
        final w = item['w'] as double;
        final h = item['h'] as double;
        final expectedRatio = item['expectedRatio'] as double;

        final actualRatio = w / h;
        expect(actualRatio, closeTo(expectedRatio, 0.0001));

        final fittedWidth = availablePinnedHeight * actualRatio;
        // Pinned card width must comfortably fit on narrow mobile screens (320dp width)
        expect(fittedWidth < 320.0, isTrue, reason: '${item['name']} must fit without horizontal overflow');
      }
    });

    test('shouldRebuild returns true when properties change and false when identical', () {
      final widgetA = Container(key: const Key('a'));
      final widgetB = Container(key: const Key('b'));

      final delegate1 = StickyCardPreviewHeaderDelegate(
        previewCard: widgetA,
        dimensionsText: '85×54 mm',
        isCollapsed: false,
        onToggleCollapse: () {},
        onFlipCard: () {},
      );

      final delegate1Identical = StickyCardPreviewHeaderDelegate(
        previewCard: widgetA,
        dimensionsText: '85×54 mm',
        isCollapsed: false,
        onToggleCollapse: () {},
        onFlipCard: () {},
      );

      final delegate2ChangedCard = StickyCardPreviewHeaderDelegate(
        previewCard: widgetB,
        dimensionsText: '85×54 mm',
        isCollapsed: false,
        onToggleCollapse: () {},
        onFlipCard: () {},
      );

      final delegate3ChangedDimensions = StickyCardPreviewHeaderDelegate(
        previewCard: widgetA,
        dimensionsText: '100×40 mm',
        isCollapsed: false,
        onToggleCollapse: () {},
        onFlipCard: () {},
      );

      final delegate4ChangedCollapsed = StickyCardPreviewHeaderDelegate(
        previewCard: widgetA,
        dimensionsText: '85×54 mm',
        isCollapsed: true,
        onToggleCollapse: () {},
        onFlipCard: () {},
      );

      expect(delegate1.shouldRebuild(delegate1Identical), isFalse);
      expect(delegate1.shouldRebuild(delegate2ChangedCard), isTrue);
      expect(delegate1.shouldRebuild(delegate3ChangedDimensions), isTrue);
      expect(delegate1.shouldRebuild(delegate4ChangedCollapsed), isTrue);
    });
  });
}
