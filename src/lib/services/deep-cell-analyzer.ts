import { google } from 'googleapis';
import { ConfigService } from './config';

export class DeepCellAnalyzer {
  /**
   * تحليل عميق للخلايا المعطلة للوصول للبيانات الأصلية
   */
  static async analyzeProblemCells(): Promise<{
    success: boolean;
    cellAnalysis: Array<{
      rowIndex: number;
      customerName: string;
      cellProblems: any;
      potentialSolutions: string[];
      contextualClues: any;
      relatedData: any;
    }>;
  }> {
    try {
      console.log('🔬 Starting deep cell analysis...');
      
      const config = await ConfigService.getGoogleConfig();
      const auth = new google.auth.GoogleAuth({
        credentials: config.credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const sheets = google.sheets({ version: 'v4', auth });
      const spreadsheetId = config.spreadsheetUrl!.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)![1];

      // Get comprehensive data including cell history, notes, and metadata
      const [valuesResponse, metadataResponse, batchResponse] = await Promise.all([
        // Standard values
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'A:P',
          valueRenderOption: 'FORMULA'
        }),
        // Full spreadsheet metadata
        sheets.spreadsheets.get({
          spreadsheetId,
          includeGridData: true,
          ranges: ['A:P']
        }),
        // Batch get with different render options
        sheets.spreadsheets.values.batchGet({
          spreadsheetId,
          ranges: ['A:P'],
          valueRenderOption: 'UNFORMATTED_VALUE',
          dateTimeRenderOption: 'FORMATTED_STRING'
        })
      ]);

      const rows = valuesResponse.data.values || [];
      const gridData = metadataResponse.data.sheets?.[0]?.data?.[0]?.rowData || [];
      const batchData = batchResponse.data.valueRanges?.[0]?.values || [];

      console.log(`📊 Analyzing ${rows.length} rows for cell problems...`);

      const cellAnalysis = [];

      // Analyze each data row
      for (let i = 1; i < rows.length; i++) {
        const rowIndex = i + 1;
        const row = rows[i] || [];
        const gridRow = gridData[i] || {};
        const batchRow = batchData[i] || [];

        const customerName = row[1] || batchRow[1] || `Row ${rowIndex}`;
        const phoneCell = row[2]; // Column C
        const whatsappCell = row[3]; // Column D

        // Check if this row has problems
        if (this.hasCellProblems(phoneCell, whatsappCell)) {
          console.log(`🔍 Analyzing problematic row ${rowIndex}: ${customerName}`);

          const analysis = await this.deepAnalyzeRow({
            rowIndex,
            customerName,
            phoneCell,
            whatsappCell,
            gridRow,
            batchRow,
            fullRow: row,
            sheets,
            spreadsheetId
          });

          cellAnalysis.push(analysis);
        }
      }

      console.log(`✅ Deep analysis complete. Found ${cellAnalysis.length} problematic cells`);

      return {
        success: true,
        cellAnalysis
      };

    } catch (error) {
      console.error('❌ Deep cell analysis failed:', error);
      return {
        success: false,
        cellAnalysis: []
      };
    }
  }

  /**
   * تحليل صف واحد بعمق
   */
  private static async deepAnalyzeRow(params: {
    rowIndex: number;
    customerName: string;
    phoneCell: any;
    whatsappCell: any;
    gridRow: any;
    batchRow: any;
    fullRow: any;
    sheets: any;
    spreadsheetId: string;
  }): Promise<any> {
    const { rowIndex, customerName, phoneCell, whatsappCell, gridRow, sheets, spreadsheetId } = params;

    // 1. Analyze cell formulas and errors
    const cellProblems = {
      phoneErrors: this.analyzeCellError(phoneCell),
      whatsappErrors: this.analyzeCellError(whatsappCell),
      formulaDetails: await this.getFormulaDetails(sheets, spreadsheetId, rowIndex)
    };

    // 2. Look for contextual clues in surrounding cells
    const contextualClues = this.extractContextualClues(params.fullRow, rowIndex);

    // 3. Check for related data patterns
    const relatedData = await this.findRelatedDataPatterns(sheets, spreadsheetId, customerName, rowIndex);

    // 4. Generate potential solutions
    const potentialSolutions = this.generateSolutions(cellProblems, contextualClues, relatedData);

    console.log(`🔧 Row ${rowIndex} (${customerName}): Generated ${potentialSolutions.length} potential solutions`);

    return {
      rowIndex,
      customerName,
      cellProblems,
      potentialSolutions,
      contextualClues,
      relatedData
    };
  }

  /**
   * تحليل خطأ الخلية
   */
  private static analyzeCellError(cellValue: any): any {
    if (!cellValue || typeof cellValue !== 'string') {
      return { hasError: false };
    }

    const errorAnalysis = {
      hasError: false,
      errorType: null as string | null,
      originalFormula: null,
      possibleCauses: [] as string[]
    };

    if (cellValue.includes('#ERROR!')) {
      errorAnalysis.hasError = true;
      errorAnalysis.errorType = 'GENERIC_ERROR';
      errorAnalysis.possibleCauses = [
        'Formula syntax error',
        'Invalid function reference',
        'Circular reference',
        'External data source error'
      ];
    }

    if (cellValue.includes('#REF!')) {
      errorAnalysis.hasError = true;
      errorAnalysis.errorType = 'REFERENCE_ERROR';
      errorAnalysis.possibleCauses = [
        'Referenced cell was deleted',
        'Sheet reference is invalid',
        'Range reference is broken'
      ];
    }

    if (cellValue.includes('#VALUE!')) {
      errorAnalysis.hasError = true;
      errorAnalysis.errorType = 'VALUE_ERROR';
      errorAnalysis.possibleCauses = [
        'Wrong data type in formula',
        'Text in numeric operation',
        'Invalid date format'
      ];
    }

    return errorAnalysis;
  }

  /**
   * الحصول على تفاصيل الصيغة
   */
  private static async getFormulaDetails(sheets: any, spreadsheetId: string, rowIndex: number): Promise<any> {
    try {
      // Get specific cell formulas
      const phoneFormula = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `C${rowIndex}`,
        valueRenderOption: 'FORMULA'
      });

      const whatsappFormula = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `D${rowIndex}`,
        valueRenderOption: 'FORMULA'
      });

      return {
        phoneFormula: phoneFormula.data.values?.[0]?.[0] || 'No formula',
        whatsappFormula: whatsappFormula.data.values?.[0]?.[0] || 'No formula'
      };
    } catch (error) {
      return { error: 'Could not retrieve formula details' };
    }
  }

  /**
   * استخراج أدلة من السياق
   */
  private static extractContextualClues(fullRow: any[], rowIndex: number): any {
    const clues = {
      hasName: !!fullRow[1],
      hasAddress: !!fullRow[6],
      hasProduct: !!fullRow[10],
      hasValue: !!fullRow[9],
      governorate: fullRow[4],
      area: fullRow[5],
      orderDate: fullRow[0],
      possiblePhoneHints: [] as string[]
    };

    // Look for phone number hints in other fields
    const textFields = [fullRow[6], fullRow[12], fullRow[13]]; // Address, Notes, Source
    
    for (const field of textFields) {
      if (field && typeof field === 'string') {
        const phoneMatches = field.match(/\d{10,11}/g) || [];
        clues.possiblePhoneHints.push(...phoneMatches);
      }
    }

    return clues;
  }

  /**
   * البحث عن أنماط البيانات المرتبطة
   */
  private static async findRelatedDataPatterns(sheets: any, spreadsheetId: string, customerName: string, currentRowIndex: number): Promise<any> {
    try {
      // Get all data to find patterns
      const allData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'A:P',
        valueRenderOption: 'FORMATTED_VALUE'
      });

      const rows = allData.data.values || [];
      const patterns = {
        sameCustomer: [] as any[],
        sameArea: [] as any[],
        phonePatterns: [] as string[]
      };

      // Look for similar customers or patterns
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const name = row[1];
        const phone = row[2];
        const area = row[5];

        if (i + 1 !== currentRowIndex) { // Skip current row
          if (name && name.includes(customerName.substring(0, 3))) {
            patterns.sameCustomer.push({ rowIndex: i + 1, name, phone });
          }

          if (area && area === rows[currentRowIndex - 1]?.[5]) {
            patterns.sameArea.push({ rowIndex: i + 1, name, phone });
          }

          // Collect valid phone patterns
          if (phone && typeof phone === 'string' && phone.match(/\d{10,11}/)) {
            patterns.phonePatterns.push(phone);
          }
        }
      }

      return patterns;
    } catch (error) {
      return { error: 'Could not analyze related patterns' };
    }
  }

  /**
   * توليد حلول محتملة
   */
  private static generateSolutions(cellProblems: any, contextualClues: any, relatedData: any): string[] {
    const solutions: string[] = [];

    // Solution 1: From contextual hints
    if (contextualClues.possiblePhoneHints.length > 0) {
      const validHints = contextualClues.possiblePhoneHints.filter((hint: string) => hint.length >= 10);
      if (validHints.length > 0) {
        solutions.push(`CONTEXT_PHONE: ${validHints[0]}`);
      }
    }

    // Solution 2: From similar customers
    if (relatedData.sameCustomer && relatedData.sameCustomer.length > 0) {
      const similarCustomer = relatedData.sameCustomer[0];
      if (similarCustomer.phone && !similarCustomer.phone.includes('#ERROR!')) {
        solutions.push(`SIMILAR_CUSTOMER: ${similarCustomer.phone}`);
      }
    }

    // Solution 3: From area patterns
    if (relatedData.sameArea && relatedData.sameArea.length > 0) {
      const areaCustomer = relatedData.sameArea[0];
      if (areaCustomer.phone && !areaCustomer.phone.includes('#ERROR!')) {
        // Extract area code and suggest pattern
        const areaPhone = areaCustomer.phone.replace(/[^\d]/g, '');
        if (areaPhone.length >= 10) {
          solutions.push(`AREA_PATTERN: ${areaPhone.substring(0, 3)}XXXXXXX (based on ${areaCustomer.name})`);
        }
      }
    }

    // Solution 4: From common phone patterns
    if (relatedData.phonePatterns && relatedData.phonePatterns.length > 0) {
      const commonPrefixes = this.extractCommonPrefixes(relatedData.phonePatterns);
      if (commonPrefixes.length > 0) {
        solutions.push(`COMMON_PREFIX: ${commonPrefixes[0]}XXXXXXX`);
      }
    }

    // Solution 5: Manual intervention suggestion
    if (solutions.length === 0) {
      solutions.push('MANUAL_LOOKUP: Contact customer directly or check original source');
      solutions.push('UPDATE_FORMULA: Fix the broken formula in Google Sheets');
    }

    return solutions;
  }

  /**
   * استخراج البادئات الشائعة
   */
  private static extractCommonPrefixes(phonePatterns: string[]): string[] {
    const prefixes = new Map<string, number>();
    
    for (const phone of phonePatterns) {
      const cleaned = phone.replace(/[^\d]/g, '');
      if (cleaned.length >= 10) {
        const prefix = cleaned.substring(0, 3);
        prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
      }
    }

    return Array.from(prefixes.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([prefix]) => prefix);
  }

  /**
   * فحص وجود مشاكل في الخلايا
   */
  private static hasCellProblems(phoneCell: any, whatsappCell: any): boolean {
    const cells = [phoneCell, whatsappCell];
    return cells.some(cell => 
      cell && typeof cell === 'string' && (
        cell.includes('#ERROR!') ||
        cell.includes('#REF!') ||
        cell.includes('#VALUE!') ||
        cell.includes('#NAME?')
      )
    );
  }
} 