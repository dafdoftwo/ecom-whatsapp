import { google } from 'googleapis';
import { ConfigService } from './config';

export class PhoneRecoveryService {
  /**
   * استخراج متقدم للأرقام من بيانات Google Sheets المعطلة
   */
  static async recoverPhoneNumbers(): Promise<{
    success: boolean;
    recoveredData: Array<{
      rowIndex: number;
      customerName: string;
      originalPhone: string;
      originalWhatsApp: string;
      recoveredNumbers: string[];
      recoveryMethod: string;
      cellMetadata: any;
    }>;
    totalRecovered: number;
  }> {
    try {
      console.log('🔧 Starting advanced phone number recovery...');
      
      const config = await ConfigService.getGoogleConfig();
      const auth = new google.auth.GoogleAuth({
        credentials: config.credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const sheets = google.sheets({ version: 'v4', auth });
      const spreadsheetId = config.spreadsheetUrl!.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)![1];

      // 1. Get ALL possible data formats
      const [basicResponse, formattedResponse, formulaResponse, detailedResponse] = await Promise.all([
        // Raw unformatted values
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'A:P',
          valueRenderOption: 'UNFORMATTED_VALUE'
        }),
        // What user sees
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'A:P', 
          valueRenderOption: 'FORMATTED_VALUE'
        }),
        // Actual formulas
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'A:P',
          valueRenderOption: 'FORMULA'
        }),
        // Full cell metadata
        sheets.spreadsheets.get({
          spreadsheetId,
          ranges: ['A:P'],
          includeGridData: true
        })
      ]);

      const basicRows = basicResponse.data.values || [];
      const formattedRows = formattedResponse.data.values || [];
      const formulaRows = formulaResponse.data.values || [];
      const detailedData = detailedResponse.data.sheets?.[0]?.data?.[0]?.rowData || [];

      console.log(`📊 Processing ${basicRows.length} rows for phone recovery...`);

      const recoveredData = [];

      // Process each row (skip header)
      for (let i = 1; i < basicRows.length; i++) {
        const rowIndex = i + 1;
        const basicRow = basicRows[i] || [];
        const formattedRow = formattedRows[i] || [];
        const formulaRow = formulaRows[i] || [];
        const detailedRow = detailedData[i] || {};

        const customerName = formattedRow[1] || basicRow[1] || `Row ${rowIndex}`;
        
        // Phone columns (C=2, D=3)
        const phoneCol = {
          basic: basicRow[2],
          formatted: formattedRow[2],
          formula: formulaRow[2],
          metadata: detailedRow.values?.[2]
        };

        const whatsappCol = {
          basic: basicRow[3],
          formatted: formattedRow[3], 
          formula: formulaRow[3],
          metadata: detailedRow.values?.[3]
        };

        // Apply recovery methods
        const recovery = await this.applyRecoveryMethods(phoneCol, whatsappCol, rowIndex);
        
        if (recovery.recoveredNumbers.length > 0 || this.hasErrors(phoneCol, whatsappCol)) {
          recoveredData.push({
            rowIndex,
            customerName,
            originalPhone: formattedRow[2] || '',
            originalWhatsApp: formattedRow[3] || '',
            recoveredNumbers: recovery.recoveredNumbers,
            recoveryMethod: recovery.method,
            cellMetadata: {
              phoneCol: this.extractCellInfo(phoneCol),
              whatsappCol: this.extractCellInfo(whatsappCol)
            }
          });

          console.log(`🔧 Row ${rowIndex} (${customerName}): Found ${recovery.recoveredNumbers.length} numbers via ${recovery.method}`);
        }
      }

      const totalRecovered = recoveredData.reduce((sum, item) => sum + item.recoveredNumbers.length, 0);
      
      console.log(`✅ Phone recovery complete: ${totalRecovered} numbers recovered from ${recoveredData.length} problematic rows`);

      return {
        success: true,
        recoveredData,
        totalRecovered
      };

    } catch (error) {
      console.error('❌ Phone recovery failed:', error);
      return {
        success: false,
        recoveredData: [],
        totalRecovered: 0
      };
    }
  }

  /**
   * تطبيق طرق استخراج متعددة
   */
  private static async applyRecoveryMethods(phoneCol: any, whatsappCol: any, rowIndex: number): Promise<{
    recoveredNumbers: string[];
    method: string;
  }> {
    const allNumbers = new Set<string>();
    const methods = [];

    // Method 1: Extract from formulas
    const formulaNumbers = this.extractFromFormulas(phoneCol.formula, whatsappCol.formula);
    if (formulaNumbers.length > 0) {
      formulaNumbers.forEach(num => allNumbers.add(num));
      methods.push('formula-extraction');
    }

    // Method 2: Deep text analysis
    const textNumbers = this.deepTextAnalysis(phoneCol, whatsappCol);
    if (textNumbers.length > 0) {
      textNumbers.forEach(num => allNumbers.add(num));
      methods.push('text-analysis');
    }

    // Method 3: Metadata scanning
    const metadataNumbers = this.extractFromMetadata(phoneCol.metadata, whatsappCol.metadata);
    if (metadataNumbers.length > 0) {
      metadataNumbers.forEach(num => allNumbers.add(num));
      methods.push('metadata-scan');
    }

    // Method 4: Pattern reconstruction
    const reconstructedNumbers = this.reconstructFromPatterns(phoneCol, whatsappCol, rowIndex);
    if (reconstructedNumbers.length > 0) {
      reconstructedNumbers.forEach(num => allNumbers.add(num));
      methods.push('pattern-reconstruction');
    }

    // Method 5: Cross-reference recovery
    const crossRefNumbers = await this.crossReferenceRecovery(phoneCol, whatsappCol, rowIndex);
    if (crossRefNumbers.length > 0) {
      crossRefNumbers.forEach(num => allNumbers.add(num));
      methods.push('cross-reference');
    }

    return {
      recoveredNumbers: Array.from(allNumbers).filter(num => this.validateRecoveredNumber(num)),
      method: methods.join('+') || 'no-recovery'
    };
  }

  /**
   * استخراج من الصيغ (Formulas)
   */
  private static extractFromFormulas(phoneFormula: any, whatsappFormula: any): string[] {
    const numbers: string[] = [];
    const formulas = [phoneFormula, whatsappFormula].filter(f => f && typeof f === 'string');

    for (const formula of formulas) {
      // Look for numbers in formula text
      const patterns = [
        /=.*?(\+?201\d{9})/g,        // Egyptian in formula
        /=.*?(\d{11})/g,             // 11 digits in formula
        /=.*?"(\+?201\d{9})"/g,      // Quoted Egyptian
        /=.*?"(\d{10,11})"/g,        // Quoted numbers
        /CONCATENATE.*?(\d{10,11})/g, // In CONCATENATE
        /\&.*?(\d{10,11})/g          // String concatenation
      ];

      for (const pattern of patterns) {
        const matches = [...formula.matchAll(pattern)];
        matches.forEach(match => {
          if (match[1] && match[1].length >= 10) {
            numbers.push(match[1]);
          }
        });
      }
    }

    return numbers;
  }

  /**
   * تحليل نصي عميق
   */
  private static deepTextAnalysis(phoneCol: any, whatsappCol: any): string[] {
    const numbers: string[] = [];
    const allValues = [
      phoneCol.basic, phoneCol.formatted, phoneCol.formula,
      whatsappCol.basic, whatsappCol.formatted, whatsappCol.formula
    ].filter(v => v && typeof v === 'string');

    // Enhanced extraction patterns
    const advancedPatterns = [
      /(?:^|[^\d])(\+?20\s*1\s*\d{2}\s*\d{3}\s*\d{4})(?:[^\d]|$)/g,  // Spaced Egyptian
      /(?:^|[^\d])(\+?201\d{2}\d{3}\d{4})(?:[^\d]|$)/g,               // Standard Egyptian
      /(?:^|[^\d])(01\d{2}\d{3}\d{4})(?:[^\d]|$)/g,                   // Local Egyptian
      /(?:^|[^\d])(\d{2}\s*\d{4}\s*\d{4})(?:[^\d]|$)/g,              // Formatted 10 digit
      /(\d{1,2}[-\s]?\d{3,4}[-\s]?\d{3,4}[-\s]?\d{3,4})/g,           // Hyphenated/spaced
      /phone.*?(\d{10,11})/gi,                                         // After "phone"
      /mobile.*?(\d{10,11})/gi,                                        // After "mobile"
      /tel.*?(\d{10,11})/gi                                            // After "tel"
    ];

    for (const value of allValues) {
      for (const pattern of advancedPatterns) {
        const matches = [...value.matchAll(pattern)];
        matches.forEach(match => {
          const number = match[1].replace(/[-\s]/g, '');
          if (number.length >= 10) {
            numbers.push(number);
          }
        });
      }
    }

    return numbers;
  }

  /**
   * استخراج من metadata الخلية
   */
  private static extractFromMetadata(phoneMetadata: any, whatsappMetadata: any): string[] {
    const numbers: string[] = [];
    const metadatas = [phoneMetadata, whatsappMetadata].filter(m => m);

    for (const metadata of metadatas) {
      if (metadata?.effectiveValue) {
        const value = metadata.effectiveValue;
        
        // Check different value types
        if (value.stringValue && typeof value.stringValue === 'string') {
          const extracted = this.extractNumbersFromString(value.stringValue);
          numbers.push(...extracted);
        }
        
        if (value.numberValue && !isNaN(value.numberValue)) {
          const numStr = value.numberValue.toString();
          if (numStr.length >= 10) {
            numbers.push(numStr);
          }
        }

        if (value.formulaValue && typeof value.formulaValue === 'string') {
          const formulaNumbers = this.extractFromFormulas(value.formulaValue, '');
          numbers.push(...formulaNumbers);
        }
      }
    }

    return numbers;
  }

  /**
   * إعادة بناء من الأنماط
   */
  private static reconstructFromPatterns(phoneCol: any, whatsappCol: any, rowIndex: number): string[] {
    const numbers: string[] = [];
    
    // Try to reconstruct based on common Egyptian patterns
    const commonPrefixes = ['201', '20', '01'];
    const commonCodes = ['10', '11', '12', '15'];
    
    // Look for partial numbers in any data
    const allData = [
      phoneCol.basic, phoneCol.formatted, phoneCol.formula,
      whatsappCol.basic, whatsappCol.formatted, whatsappCol.formula
    ].filter(v => v).join(' ');

    // Extract any digit sequences
    const digitSequences = allData.match(/\d+/g) || [];
    
    for (const sequence of digitSequences) {
      if (sequence.length >= 8) {
        // Try different reconstructions
        const attempts = [
          sequence,                           // As is
          '01' + sequence.slice(-9),         // Add Egyptian mobile prefix
          '201' + sequence.slice(-9),        // Add country code
          '+201' + sequence.slice(-9)        // Add international format
        ];

        for (const attempt of attempts) {
          if (this.validateRecoveredNumber(attempt)) {
            numbers.push(attempt);
          }
        }
      }
    }

    return numbers;
  }

  /**
   * استرداد بالمراجع المتقاطعة
   */
  private static async crossReferenceRecovery(phoneCol: any, whatsappCol: any, rowIndex: number): Promise<string[]> {
    // This would ideally cross-reference with other data sources
    // For now, return empty but structure is ready for enhancement
    return [];
  }

  /**
   * استخراج أرقام من نص
   */
  private static extractNumbersFromString(text: string): string[] {
    const numbers: string[] = [];
    const patterns = [
      /\+?201\d{9}/g,
      /01\d{9}/g,
      /\d{11}/g,
      /\d{10}/g
    ];

    for (const pattern of patterns) {
      const matches = text.match(pattern) || [];
      numbers.push(...matches);
    }

    return numbers;
  }

  /**
   * التحقق من صحة الرقم المسترد
   */
  private static validateRecoveredNumber(number: string): boolean {
    if (!number || typeof number !== 'string') return false;
    
    const cleaned = number.replace(/[^\d]/g, '');
    
    // Egyptian number validation
    if (cleaned.length === 11 && cleaned.startsWith('01')) return true;
    if (cleaned.length === 12 && cleaned.startsWith('201')) return true;
    if (cleaned.length === 13 && cleaned.startsWith('+201')) return true;
    if (cleaned.length === 10 && /^1\d{9}$/.test(cleaned)) return true;
    
    return false;
  }

  /**
   * فحص وجود أخطاء
   */
  private static hasErrors(phoneCol: any, whatsappCol: any): boolean {
    const allValues = [
      phoneCol.basic, phoneCol.formatted, phoneCol.formula,
      whatsappCol.basic, whatsappCol.formatted, whatsappCol.formula
    ];

    return allValues.some(val => 
      val && typeof val === 'string' && (
        val.includes('#ERROR!') ||
        val.includes('#REF!') ||
        val.includes('#VALUE!') ||
        val.includes('#NAME?') ||
        val.includes('Formula parse error')
      )
    );
  }

  /**
   * استخراج معلومات الخلية
   */
  private static extractCellInfo(col: any) {
    return {
      basic: col.basic,
      formatted: col.formatted,
      formula: col.formula,
      hasMetadata: !!col.metadata,
      valueType: col.metadata?.effectiveValue ? Object.keys(col.metadata.effectiveValue)[0] : 'unknown'
    };
  }
} 