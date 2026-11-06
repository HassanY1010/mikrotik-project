import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';
import '../../../core/models/card_pdf_archive_model.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import 'pdf_viewer_screen.dart';

/// Screen displaying the PDF History & Archive («الملفات السابقة»)
class PdfHistoryScreen extends ConsumerStatefulWidget {
  const PdfHistoryScreen({super.key});

  @override
  ConsumerState<PdfHistoryScreen> createState() => _PdfHistoryScreenState();
}

class _PdfHistoryScreenState extends ConsumerState<PdfHistoryScreen> {
  final TextEditingController _searchController = TextEditingController();
  DateTime? _startDate;
  DateTime? _endDate;
  bool _sortAsc = false;

  bool _isLoading = true;
  String? _errorMessage;
  List<CardPdfArchiveModel> _archives = [];
  int _totalCount = 0;
  int _currentPage = 1;
  int _totalPages = 1;

  // Track in-progress operations per archive id to prevent duplicate taps
  final Set<String> _loadingActionIds = {};

  @override
  void initState() {
    super.initState();
    _loadArchives();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadArchives({int page = 1}) async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final service = ref.read(cardPdfArchiveServiceProvider);
      final result = await service.getArchives(
        search: _searchController.text.trim(),
        startDate: _startDate,
        endDate: _endDate,
        sortAsc: _sortAsc,
        page: page,
        limit: 25,
      );

      if (mounted) {
        setState(() {
          _archives = result['data'] as List<CardPdfArchiveModel>;
          _totalCount = result['total'] as int;
          _currentPage = result['page'] as int;
          _totalPages = result['totalPages'] as int;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'تعذر تحميل أرشيف الملفات السابقة: $e';
          _isLoading = false;
        });
      }
    }
  }

  void _showSnackBar(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? const Color(0xFFEF4444) : const Color(0xFF10B981),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _viewArchivePdf(CardPdfArchiveModel archive) async {
    if (_loadingActionIds.contains(archive.id)) return;
    setState(() => _loadingActionIds.add(archive.id));

    try {
      final service = ref.read(cardPdfArchiveServiceProvider);
      final Uint8List pdfBytes = await service.downloadArchivePdf(
        archive.id,
        signedUrl: archive.signedUrl,
      );

      if (mounted) {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => PdfViewerScreen(
              pdfBytes: pdfBytes,
              title: archive.fileName,
              filename: archive.fileName,
              totalCards: archive.cardCount,
            ),
          ),
        );
      }
    } catch (e) {
      _showSnackBar('فشل فتح ملف PDF: $e', isError: true);
    } finally {
      if (mounted) {
        setState(() => _loadingActionIds.remove(archive.id));
      }
    }
  }

  Future<void> _shareArchivePdf(CardPdfArchiveModel archive) async {
    if (_loadingActionIds.contains(archive.id)) return;
    setState(() => _loadingActionIds.add(archive.id));

    try {
      final service = ref.read(cardPdfArchiveServiceProvider);
      final Uint8List pdfBytes = await service.downloadArchivePdf(
        archive.id,
        signedUrl: archive.signedUrl,
      );

      await Printing.sharePdf(
        bytes: pdfBytes,
        filename: archive.fileName,
      );
    } catch (e) {
      _showSnackBar('فشل مشاركة ملف PDF: $e', isError: true);
    } finally {
      if (mounted) {
        setState(() => _loadingActionIds.remove(archive.id));
      }
    }
  }

  Future<void> _confirmAndDelete(CardPdfArchiveModel archive) async {
    if (_loadingActionIds.contains(archive.id)) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.bgCard,
        title: Row(
          children: [
            const Icon(Icons.delete_forever, color: Color(0xFFEF4444), size: 24),
            const SizedBox(width: 8),
            Text(
              'حذف ملف من الأرشيف',
              style: TextStyle(color: ctx.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        content: Text(
          'هل أنت متأكد من حذف الملف "${archive.fileName}" نهائياً من أرشيف السحابة والتخزين؟ لا يمكن التراجع عن هذا الإجراء.',
          style: TextStyle(color: ctx.textSecondary, fontSize: 13, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('إلغاء', style: TextStyle(color: ctx.textSecondary)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFEF4444),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('تأكيد الحذف'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _loadingActionIds.add(archive.id));

    try {
      final service = ref.read(cardPdfArchiveServiceProvider);
      final success = await service.deleteArchive(archive.id);

      if (success) {
        setState(() {
          _archives.removeWhere((a) => a.id == archive.id);
          _totalCount = (_totalCount - 1).clamp(0, 999999);
        });
        _showSnackBar('تم حذف الملف بنجاح من الأرشيف والتخزين');
      } else {
        _showSnackBar('تعذر إتمام عملية الحذف، يرجى المحاولة لاحقاً', isError: true);
      }
    } catch (e) {
      _showSnackBar('فشل حذف الملف: $e', isError: true);
    } finally {
      if (mounted) {
        setState(() => _loadingActionIds.remove(archive.id));
      }
    }
  }

  Future<void> _pickDateFilter() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 2),
      lastDate: DateTime(now.year + 1),
      initialDateRange: (_startDate != null && _endDate != null)
          ? DateTimeRange(start: _startDate!, end: _endDate!)
          : null,
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: ColorScheme.dark(
              primary: AppTheme.primary,
              onPrimary: Colors.white,
              surface: context.bgCard,
              onSurface: context.textPrimary,
            ),
          ),
          child: child!,
        );
      },
    );

    if (picked != null) {
      setState(() {
        _startDate = picked.start;
        _endDate = DateTime(picked.end.year, picked.end.month, picked.end.day, 23, 59, 59);
      });
      _loadArchives();
    }
  }

  void _clearDateFilter() {
    setState(() {
      _startDate = null;
      _endDate = null;
    });
    _loadArchives();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgScaffold,
      appBar: AppBar(
        backgroundColor: context.bgCard,
        elevation: 0,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: AppTheme.primary.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.picture_as_pdf_outlined, color: AppTheme.primary, size: 22),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'الملفات السابقة',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: context.textPrimary,
                  ),
                ),
                Text(
                  'أرشيف ملفات PDF السحابي للعميل ($_totalCount ملف)',
                  style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: AppTheme.primary),
            tooltip: 'تحديث الأرشيف',
            onPressed: () => _loadArchives(page: _currentPage),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => _loadArchives(page: 1),
        color: AppTheme.primary,
        child: Column(
          children: [
            // Search and Filter Bar
            _buildSearchBar(),

            // Date & Sorting Controls
            _buildFilterRow(),

            // Content Area
            Expanded(
              child: _buildContent(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
      color: context.bgCard,
      child: TextField(
        controller: _searchController,
        style: TextStyle(color: context.textPrimary, fontSize: 14),
        decoration: InputDecoration(
          hintText: 'البحث عن ملف بالاسم، الشبكة أو الباقة...',
          hintStyle: TextStyle(color: context.textSecondary, fontSize: 13),
          prefixIcon: const Icon(Icons.search, color: Color(0xFF94A3B8), size: 20),
          suffixIcon: _searchController.text.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: () {
                    _searchController.clear();
                    _loadArchives();
                  },
                )
              : null,
          filled: true,
          fillColor: context.bgScaffold,
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(color: context.borderColor),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(color: context.borderColor),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: AppTheme.primary),
          ),
        ),
        onSubmitted: (_) => _loadArchives(page: 1),
      ),
    );
  }

  Widget _buildFilterRow() {
    final hasDateFilter = _startDate != null && _endDate != null;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      color: context.bgCard,
      child: Row(
        children: [
          // Date Filter Button
          InkWell(
            onTap: _pickDateFilter,
            borderRadius: BorderRadius.circular(8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: hasDateFilter ? AppTheme.primary.withValues(alpha: 0.15) : context.bgScaffold,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: hasDateFilter ? AppTheme.primary : context.borderColor,
                  width: 1,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.calendar_today_outlined,
                    size: 14,
                    color: hasDateFilter ? AppTheme.primary : context.textSecondary,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    hasDateFilter
                        ? '${_startDate!.year}/${_startDate!.month}/${_startDate!.day} - ${_endDate!.month}/${_endDate!.day}'
                        : 'تصفية بالتاريخ',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: hasDateFilter ? FontWeight.bold : FontWeight.normal,
                      color: hasDateFilter ? AppTheme.primary : context.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ),

          if (hasDateFilter) ...[
            const SizedBox(width: 6),
            InkWell(
              onTap: _clearDateFilter,
              child: Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: context.bgScaffold,
                  shape: BoxShape.circle,
                  border: Border.all(color: context.borderColor),
                ),
                child: const Icon(Icons.close, size: 12, color: Color(0xFFEF4444)),
              ),
            ),
          ],

          const Spacer(),

          // Sort Toggle Button
          InkWell(
            onTap: () {
              setState(() => _sortAsc = !_sortAsc);
              _loadArchives(page: 1);
            },
            borderRadius: BorderRadius.circular(8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: context.bgScaffold,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: context.borderColor),
              ),
              child: Row(
                children: [
                  Icon(
                    _sortAsc ? Icons.arrow_upward : Icons.arrow_downward,
                    size: 14,
                    color: AppTheme.primary,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _sortAsc ? 'الأقدم أولاً' : 'الأحدث أولاً',
                    style: TextStyle(fontSize: 12, color: context.textPrimary, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContent() {
    if (_isLoading) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(color: AppTheme.primary),
            SizedBox(height: 14),
            Text('جاري تحميل أرشيف الملفات السابقة...', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13)),
          ],
        ),
      );
    }

    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.cloud_off_outlined, color: Color(0xFFEF4444), size: 48),
              const SizedBox(height: 12),
              Text(
                _errorMessage!,
                textAlign: TextAlign.center,
                style: TextStyle(color: context.textPrimary, fontSize: 14),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  foregroundColor: Colors.white,
                ),
                onPressed: () => _loadArchives(page: _currentPage),
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('إعادة المحاولة'),
              ),
            ],
          ),
        ),
      );
    }

    if (_archives.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.folder_open, color: AppTheme.primary, size: 54),
              ),
              const SizedBox(height: 18),
              Text(
                'لا توجد ملفات PDF سابقة حالياً',
                style: TextStyle(color: context.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Text(
                'عند توليد أو إنشاء أي دفعة كروت جديدة، سيتم حفظ نسخة PDF الأصلية تلقائياً في هذا الأرشيف ليتسنى لك الرجوع إليها وعرضها ومشاركتها في أي وقت.',
                textAlign: TextAlign.center,
                style: TextStyle(color: context.textSecondary, fontSize: 12, height: 1.5),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _archives.length + (_totalPages > 1 ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == _archives.length) {
          return _buildPaginationControls();
        }
        final archive = _archives[index];
        return _buildArchiveCard(archive);
      },
    );
  }

  Widget _buildArchiveCard(CardPdfArchiveModel archive) {
    final isActionLoading = _loadingActionIds.contains(archive.id);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.borderColor),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Row: Icon + File Name + Badges
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEF4444).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.picture_as_pdf, color: Color(0xFFEF4444), size: 26),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        archive.fileName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: context.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(Icons.access_time, size: 12, color: context.textSecondary),
                          const SizedBox(width: 4),
                          Text(
                            '${archive.formattedDate} - ${archive.formattedTime}',
                            style: TextStyle(fontSize: 11, color: context.textSecondary),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                // Card count badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.primary.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: AppTheme.primary.withValues(alpha: 0.3)),
                  ),
                  child: Text(
                    '${archive.cardCount} كرت',
                    style: const TextStyle(
                      color: AppTheme.primary,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 10),

            // Metadata Tags Row
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                _buildTag(Icons.storage, archive.formattedFileSize),
                if (archive.networkName != null && archive.networkName!.isNotEmpty)
                  _buildTag(Icons.wifi, archive.networkName!),
                if (archive.profileName != null && archive.profileName!.isNotEmpty)
                  _buildTag(Icons.local_offer_outlined, archive.profileName!),
                if (archive.templateType != null && archive.templateType!.isNotEmpty)
                  _buildTag(Icons.palette_outlined, archive.templateType!),
              ],
            ),

            const SizedBox(height: 12),
            const Divider(height: 1, color: Color(0xFF334155)),
            const SizedBox(height: 10),

            // Bottom Actions Row (View, Share, Delete)
            Row(
              children: [
                // View Button
                Expanded(
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    onPressed: isActionLoading ? null : () => _viewArchivePdf(archive),
                    icon: isActionLoading
                        ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : const Icon(Icons.visibility_outlined, size: 16),
                    label: const Text('عرض', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                  ),
                ),
                const SizedBox(width: 8),

                // Share Button
                Expanded(
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: context.textPrimary,
                      side: BorderSide(color: context.borderColor),
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    onPressed: isActionLoading ? null : () => _shareArchivePdf(archive),
                    icon: const Icon(Icons.share_outlined, size: 16),
                    label: const Text('مشاركة', style: TextStyle(fontSize: 12)),
                  ),
                ),
                const SizedBox(width: 8),

                // Delete Button
                InkWell(
                  onTap: isActionLoading ? null : () => _confirmAndDelete(archive),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEF4444).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.2)),
                    ),
                    child: const Icon(Icons.delete_outline, color: Color(0xFFEF4444), size: 18),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTag(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: context.bgScaffold,
        borderRadius: BorderRadius.circular(5),
        border: Border.all(color: context.borderColor, width: 0.7),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: context.textSecondary),
          const SizedBox(width: 4),
          Text(text, style: TextStyle(fontSize: 10, color: context.textSecondary)),
        ],
      ),
    );
  }

  Widget _buildPaginationControls() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_right),
            onPressed: _currentPage > 1 ? () => _loadArchives(page: _currentPage - 1) : null,
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              'صفحة $_currentPage من $_totalPages',
              style: TextStyle(color: context.textPrimary, fontSize: 13, fontWeight: FontWeight.bold),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_left),
            onPressed: _currentPage < _totalPages ? () => _loadArchives(page: _currentPage + 1) : null,
          ),
        ],
      ),
    );
  }
}
