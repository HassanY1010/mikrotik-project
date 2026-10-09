import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';
import { CardItem, ShiftSummaryData } from '../types/view-models';

export interface CardThemePreset {
  id: string;
  name: string;
  primaryColor: string;
  accentColor: string;
  headerTextColor: string;
  badgeTextColor: string;
}

export const CARD_THEMES: Record<string, CardThemePreset> = {
  FOOTBALL: {
    id: 'FOOTBALL',
    name: 'ثيم كرة القدم الذهبي',
    primaryColor: '#065f46',
    accentColor: '#f59e0b',
    headerTextColor: '#ffffff',
    badgeTextColor: '#000000',
  },
  EID_MUBARAK: {
    id: 'EID_MUBARAK',
    name: 'عيد مبارك الملكي',
    primaryColor: '#1e3a8a',
    accentColor: '#d97706',
    headerTextColor: '#ffffff',
    badgeTextColor: '#ffffff',
  },
  TURQUOISE: {
    id: 'TURQUOISE',
    name: 'الفيروزي الحديث',
    primaryColor: '#0f766e',
    accentColor: '#06b6d4',
    headerTextColor: '#ffffff',
    badgeTextColor: '#000000',
  },
  TICKET: {
    id: 'TICKET',
    name: 'تذكرة كلاسيكية',
    primaryColor: '#4338ca',
    accentColor: '#ec4899',
    headerTextColor: '#ffffff',
    badgeTextColor: '#ffffff',
  },
  COMPACT: {
    id: 'COMPACT',
    name: 'مدمج أنيق',
    primaryColor: '#334155',
    accentColor: '#64748b',
    headerTextColor: '#ffffff',
    badgeTextColor: '#ffffff',
  },
};

export interface ExportCardsPdfOptions {
  format: 'A4_GRID' | 'A4_GRID_100' | 'THERMAL_ROLL' | 'THERMAL_80';
  themePreset?: string;
  networkName: string;
  supportPhone?: string;
  batchNumber?: string;
  includeQr?: boolean;
  loginUrl?: string;
  onProgress?: (current: number, total: number) => void;
}

export class PdfExportService {
  /**
   * Pre-generates QR code data URLs offline with high error correction
   */
  private static async generateQrDataUrl(text: string): Promise<string> {
    try {
      const loginUrl = `http://login.hotspot/login?username=${encodeURIComponent(text)}`;
      return await QRCode.toDataURL(loginUrl, {
        margin: 1,
        width: 180,
        errorCorrectionLevel: 'M',
      });
    } catch {
      return '';
    }
  }

  /**
   * Exports cards to print-ready PDF matching the selected theme and layout
   */
  public static async exportCardsPdf(
    cards: CardItem[],
    options: ExportCardsPdfOptions
  ): Promise<void> {
    if (cards.length === 0) return;

    const theme = CARD_THEMES[options.themePreset || 'FOOTBALL'] || CARD_THEMES.FOOTBALL;
    const isDense = options.format === 'A4_GRID_100';
    const isThermal = options.format === 'THERMAL_ROLL' || options.format === 'THERMAL_80';

    // Cards per page configuration
    const cardsPerPage = isDense ? 100 : isThermal ? 1 : 12;
    const totalPages = Math.ceil(cards.length / cardsPerPage);

    // Pre-generate QR codes for cards (for standard A4 and thermal formats)
    const qrMap = new Map<string, string>();
    if (!isDense) {
      for (const card of cards) {
        if (!qrMap.has(card.username)) {
          const qr = await this.generateQrDataUrl(card.username);
          qrMap.set(card.username, qr);
        }
      }
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: isThermal ? [80, 160] : 'a4',
    });

    // Hidden container for DOM-to-Canvas rendering
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = isThermal ? '80mm' : '210mm';
    container.style.backgroundColor = '#ffffff';
    container.style.fontFamily = "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif";
    container.style.direction = 'rtl';
    container.style.boxSizing = 'border-box';
    document.body.appendChild(container);

    try {
      for (let p = 0; p < totalPages; p++) {
        options.onProgress?.(p + 1, totalPages);

        if (p > 0) {
          doc.addPage(isThermal ? [80, 160] : 'a4', 'portrait');
        }

        const pageCards = cards.slice(p * cardsPerPage, (p + 1) * cardsPerPage);
        container.innerHTML = '';

        if (isDense) {
          // Dense 100-grid sheet (5 cols x 20 rows)
          container.innerHTML = this.renderDensePageHtml(pageCards, theme, options, p + 1, totalPages);
        } else if (isThermal) {
          // Thermal voucher
          container.innerHTML = this.renderThermalPageHtml(pageCards[0], theme, options, qrMap.get(pageCards[0].username) || '');
        } else {
          // Standard 12-grid sheet (3 cols x 4 rows)
          container.innerHTML = this.renderStandardPageHtml(pageCards, theme, options, qrMap, p + 1, totalPages);
        }

        // Render to high resolution canvas
        const canvas = await html2canvas(container, {
          scale: 2, // 2x scale for sharp print quality
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        if (isThermal) {
          doc.addImage(imgData, 'JPEG', 0, 0, 80, 160, undefined, 'FAST');
        } else {
          doc.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        }
      }

      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `Hotspot_Cards_${options.format}_${theme.id}_${timestamp}.pdf`;
      doc.save(filename);
    } finally {
      document.body.removeChild(container);
    }
  }

  /**
   * HTML Template for Standard 12-grid A4 page (3 cols x 4 rows)
   */
  private static renderStandardPageHtml(
    cards: CardItem[],
    theme: CardThemePreset,
    options: ExportCardsPdfOptions,
    qrMap: Map<string, string>,
    pageNumber: number,
    totalPages: number
  ): string {
    const cardsHtml = cards
      .map((card, idx) => {
        const qrUrl = qrMap.get(card.username) || '';
        const hasPin = card.clearPassword && card.clearPassword !== card.username;

        return `
          <div style="border: 1.5px dashed ${theme.primaryColor}; border-radius: 8px; padding: 10px; background-color: #ffffff; text-align: center; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; height: 64mm;">
            <!-- Header bar with theme color -->
            <div style="background-color: ${theme.primaryColor}; color: ${theme.headerTextColor}; border-radius: 5px; padding: 4px 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-weight: 700; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;">${options.networkName || 'شبكة الواي فاي'}</span>
              <span style="background-color: ${theme.accentColor}; color: ${theme.badgeTextColor}; font-weight: 800; font-size: 10px; padding: 2px 6px; border-radius: 4px;">${card.price} SDG</span>
            </div>

            <!-- Profile Title in Arabic -->
            <div style="font-size: 11px; font-weight: 800; color: ${theme.primaryColor}; margin-bottom: 4px;">
              ${card.profile?.displayName || 'باقة إنترنت هوتسبوت'}
            </div>

            <!-- QR Code -->
            ${
              qrUrl
                ? `<div style="display: flex; justify-content: center; margin: 2px 0;">
                     <img src="${qrUrl}" style="width: 54px; height: 54px; border: 1px solid #e2e8f0; border-radius: 4px;" alt="QR" />
                   </div>`
                : ''
            }

            <!-- Credentials Box -->
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px; margin: 4px 0;">
              <div style="font-size: 9px; color: #64748b; margin-bottom: 1px;">${hasPin ? 'اسم المستخدم / الكود' : 'كود الدخول (PIN)'}</div>
              <div style="font-family: monospace; font-size: 15px; font-weight: 900; color: #0f172a; direction: ltr; letter-spacing: 1px;">
                ${card.username}
              </div>
              ${
                hasPin
                  ? `<div style="font-family: monospace; font-size: 11px; font-weight: 800; color: #dc2626; direction: ltr; margin-top: 2px;">
                       PIN: ${card.clearPassword}
                     </div>`
                  : ''
              }
            </div>

            <!-- Footer: Serial & Instructions -->
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 8px; color: #64748b; border-top: 0.5px solid #e2e8f0; padding-top: 3px;">
              <span style="direction: ltr;">SN: ${card.serialNumber || `#${idx + 1}`}</span>
              <span>امسح الرمز أو ادخل الكود</span>
            </div>
          </div>
        `;
      })
      .join('');

    return `
      <div style="width: 210mm; min-height: 297mm; padding: 8mm; box-sizing: border-box; background-color: #ffffff;">
        <!-- Page Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 6mm; font-size: 9px; color: #64748b;">
          <span style="font-weight: 700;">شبكة: ${options.networkName || 'SudaFi Net'} ${options.batchNumber ? `| دفعة: ${options.batchNumber}` : ''}</span>
          ${options.supportPhone ? `<span>دعم فني: ${options.supportPhone}</span>` : ''}
          <span>صفحة ${pageNumber} من ${totalPages} (${cards.length} كرت)</span>
        </div>

        <!-- 3x4 Cards Grid -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm;">
          ${cardsHtml}
        </div>
      </div>
    `;
  }

  /**
   * HTML Template for Dense 100-grid A4 page (5 cols x 20 rows)
   */
  private static renderDensePageHtml(
    cards: CardItem[],
    theme: CardThemePreset,
    options: ExportCardsPdfOptions,
    pageNumber: number,
    totalPages: number
  ): string {
    const cardsHtml = cards
      .map((card, idx) => {
        const hasPin = card.clearPassword && card.clearPassword !== card.username;

        return `
          <div style="border: 0.8px dashed #94a3b8; border-radius: 3px; padding: 2px 3px; background-color: #ffffff; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; height: 12.8mm; overflow: hidden;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 0.5px solid #cbd5e1; padding-bottom: 1px; font-size: 6.5px; font-weight: 700;">
              <span style="color: ${theme.primaryColor}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 65%;">${card.profile?.displayName || 'باقة إنترنت'}</span>
              <span style="color: ${theme.accentColor}; font-weight: 800;">${card.price} SDG</span>
            </div>
            <div style="text-align: center; margin: 1px 0;">
              <div style="font-family: monospace; font-size: 9.5px; font-weight: 900; direction: ltr; color: #0f172a; letter-spacing: 0.5px;">${card.username}</div>
              ${hasPin ? `<div style="font-size: 6.5px; font-weight: 700; color: #dc2626; direction: ltr;">PIN: ${card.clearPassword}</div>` : ''}
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 5.5px; color: #64748b; border-top: 0.5px dotted #e2e8f0; padding-top: 1px;">
              <span>${options.networkName || 'SudaFi'}</span>
              <span style="direction: ltr;">#${card.serialNumber ? card.serialNumber.slice(-5) : idx + 1}</span>
            </div>
          </div>
        `;
      })
      .join('');

    return `
      <div style="width: 210mm; min-height: 297mm; padding: 6mm; box-sizing: border-box; background-color: #ffffff;">
        <!-- Dense Page Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; margin-bottom: 3mm; font-size: 8px; color: #64748b;">
          <span style="font-weight: 700;">شبكة: ${options.networkName || 'SudaFi'} ${options.batchNumber ? `| دفعة: ${options.batchNumber}` : ''}</span>
          <span>صفحة ${pageNumber} من ${totalPages} (100 كرت مكثف / ورقة A4)</span>
        </div>

        <!-- 5x20 Grid -->
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 1.5mm;">
          ${cardsHtml}
        </div>
      </div>
    `;
  }

  /**
   * HTML Template for Continuous Thermal Roll Voucher (80mm)
   */
  private static renderThermalPageHtml(
    card: CardItem,
    _theme: CardThemePreset,
    options: ExportCardsPdfOptions,
    qrUrl: string
  ): string {
    return `
      <div style="width: 80mm; padding: 6mm; box-sizing: border-box; background-color: #ffffff; color: #000000; text-align: center; font-family: monospace;">
        <div style="font-size: 15px; font-weight: 900; margin-bottom: 2px;">${options.networkName || 'شبكة الواي فاي'}</div>
        <div style="font-size: 10px; color: #555;">إيصال شحن رصيد هوتسبوت</div>
        <div style="border-bottom: 1px dashed #000000; margin: 8px 0;"></div>

        <div style="display: flex; justify-content: space-between; font-size: 11px; margin: 4px 0;">
          <span>الباقة:</span>
          <span style="font-weight: bold;">${card.profile?.displayName || 'باقة إنترنت'}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin: 4px 0;">
          <span>السعر:</span>
          <span style="font-weight: bold;">${card.price} SDG</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; margin: 4px 0; direction: ltr;">
          <span>SN:</span>
          <span>${card.serialNumber || '---'}</span>
        </div>

        <div style="border: 1px solid #000000; border-radius: 4px; padding: 8px; margin: 10px 0;">
          <div style="font-size: 9px; color: #555; margin-bottom: 2px;">اسم المستخدم / الكود</div>
          <div style="font-size: 18px; font-weight: 900; direction: ltr; letter-spacing: 2px;">${card.username}</div>
          ${
            card.clearPassword && card.clearPassword !== card.username
              ? `<div style="font-size: 13px; font-weight: 900; color: #b91c1c; direction: ltr; margin-top: 4px;">PIN: ${card.clearPassword}</div>`
              : ''
          }
        </div>

        ${
          qrUrl
            ? `<div style="display: flex; justify-content: center; margin: 8px 0;">
                 <img src="${qrUrl}" style="width: 75px; height: 75px; border: 1px solid #ccc;" alt="QR" />
               </div>`
            : ''
        }

        <div style="border-bottom: 1px dashed #000000; margin: 8px 0;"></div>
        ${options.supportPhone ? `<div style="font-size: 10px;">خدمة العملاء: ${options.supportPhone}</div>` : ''}
        <div style="font-size: 9px; color: #666; margin-top: 4px;">نتمنى لكم تصفحاً ممتعاً وسريعاً</div>
      </div>
    `;
  }

  /**
   * Exports comprehensive Executive Shift Closing Report as high-resolution PDF
   */
  public static async exportShiftSummaryPdf(
    shiftSummary: ShiftSummaryData,
    tenantName = 'شبكة ميكروتك هوتسبوت'
  ): Promise<void> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '210mm';
    container.style.backgroundColor = '#ffffff';
    container.style.fontFamily = "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif";
    container.style.direction = 'rtl';
    container.style.boxSizing = 'border-box';
    document.body.appendChild(container);

    const todayStr = new Date().toLocaleDateString('ar-SD');
    const currency = shiftSummary.currency || 'SDG';

    const profilesRows = (shiftSummary.profileBreakdown || [])
      .map(
        (p) => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 12px; font-weight: 700; color: #1e293b;">${p.profileName}</td>
          <td style="padding: 8px 12px; text-align: center; color: #475569;">${p.count} كرت</td>
          <td style="padding: 8px 12px; text-align: left; font-weight: 800; color: #0d9488; direction: ltr;">
            ${Number(p.totalAmount ?? p.total ?? 0).toLocaleString()} ${currency}
          </td>
        </tr>
      `
      )
      .join('');

    container.innerHTML = `
      <div style="width: 210mm; min-height: 297mm; padding: 16mm; box-sizing: border-box; background-color: #ffffff; color: #0f172a;">
        <!-- Header -->
        <div style="background-color: #0f172a; color: #ffffff; border-radius: 10px; padding: 18px 24px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div>
            <h1 style="margin: 0; font-size: 20px; font-weight: 900;">${tenantName}</h1>
            <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8;">تقرير إغلاق وردية الكاشير والمبيعات المالية</p>
          </div>
          <div style="text-align: left;">
            <div style="background-color: #0d9488; color: #ffffff; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; display: inline-block;">
              معتمد ومطابق
            </div>
            <div style="font-size: 11px; color: #cbd5e1; margin-top: 4px;">تاريخ التقرير: ${todayStr}</div>
          </div>
        </div>

        <!-- 3 KPI Cards -->
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 24px;">
          <div style="background-color: #f0fdf4; border: 1.5px solid #16a34a; border-radius: 8px; padding: 14px;">
            <div style="font-size: 11px; color: #166534; font-weight: 700;">إجمالي المبالغ في الصندوق</div>
            <div style="font-size: 24px; font-weight: 900; color: #15803d; margin-top: 4px; direction: ltr; text-align: right;">
              ${Number(shiftSummary.totalRevenue || 0).toLocaleString()} ${currency}
            </div>
          </div>
          <div style="background-color: #fefce8; border: 1.5px solid #ca8a04; border-radius: 8px; padding: 14px;">
            <div style="font-size: 11px; color: #854d0e; font-weight: 700;">إجمالي عدد الكروت المباعة</div>
            <div style="font-size: 24px; font-weight: 900; color: #a16207; margin-top: 4px;">
              ${shiftSummary.totalSalesCount ?? shiftSummary.totalTransactions ?? 0} كرت
            </div>
          </div>
        </div>

        <!-- Profiles Table -->
        <div style="margin-bottom: 28px;">
          <h3 style="font-size: 13px; font-weight: 800; color: #334155; margin-bottom: 8px; border-bottom: 2px solid #0d9488; padding-bottom: 4px; display: inline-block;">
            تفصيل مبيعات باقات الهوتسبوت خلال الوردية
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;">
            <thead>
              <tr style="background-color: #f1f5f9; color: #475569; font-weight: 800;">
                <th style="padding: 10px 12px; text-align: right;">اسم الباقة</th>
                <th style="padding: 10px 12px; text-align: center;">الكروت المباعة</th>
                <th style="padding: 10px 12px; text-align: left;">إجمالي الإيراد</th>
              </tr>
            </thead>
            <tbody>
              ${profilesRows || '<tr><td colspan="3" style="padding: 12px; text-align: center; color: #94a3b8;">لا توجد باقات مباعة مسجلة</td></tr>'}
            </tbody>
          </table>
        </div>

        <!-- Signature & Audit Footer -->
        <div style="margin-top: 40px; border-top: 1px dashed #cbd5e1; padding-top: 20px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b;">
          <div>
            <div>توقيع الكاشير المسؤول: ___________________</div>
          </div>
          <div>
            <div>اعتماد المشرف المالي: ___________________</div>
          </div>
        </div>
      </div>
    `;

    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      doc.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      doc.save(`Shift_Summary_Report_${Date.now()}.pdf`);
    } finally {
      document.body.removeChild(container);
    }
  }
}
