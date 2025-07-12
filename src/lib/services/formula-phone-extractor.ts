export class FormulaPhoneExtractor {
  /**
   * استخراج متخصص للأرقام من الصيغ المعطلة مثل =20 102 083 8442
   */
  static extractPhoneFromFormula(formulaValue: string): string | null {
    if (!formulaValue || typeof formulaValue !== 'string') {
      return null;
    }

    console.log(`🔍 FORMULA EXTRACTION: Analyzing "${formulaValue}"`);

    // نماذج مختلفة للصيغ التي تحتوي على أرقام هاتف
    const extractionPatterns = [
      // Pattern 1: =20 102 083 8442 (المشكلة الحالية)
      /^=(\d{2})\s+(\d{3})\s+(\d{3})\s+(\d{4})$/,
      
      // Pattern 2: =201 02 083 8442
      /^=(\d{3})\s+(\d{2})\s+(\d{3})\s+(\d{4})$/,
      
      // Pattern 3: =+20 102 083 8442
      /^=\+(\d{2})\s+(\d{3})\s+(\d{3})\s+(\d{4})$/,
      
      // Pattern 4: =01020838442
      /^=(\d{11})$/,
      
      // Pattern 5: =201020838442
      /^=(\d{12})$/,
      
      // Pattern 6: أي تسلسل أرقام مفصولة بمسافات
      /^=(.+)$/
    ];

    for (let i = 0; i < extractionPatterns.length; i++) {
      const pattern = extractionPatterns[i];
      const match = formulaValue.match(pattern);
      
      if (match) {
        console.log(`✅ PATTERN ${i + 1} MATCHED:`, match);
        
        if (i === 0) {
          // Pattern 1: =20 102 083 8442
          const reconstructed = match[1] + match[2] + match[3] + match[4];
          console.log(`🔧 Reconstructed from pattern 1: ${reconstructed}`);
          
          // التحقق من صحة الرقم المصري
          if (this.isValidEgyptianNumber(reconstructed)) {
            return reconstructed;
          }
          
          // محاولة إضافة 1 في البداية لتكوين رقم صالح
          const withPrefix = '1' + reconstructed.slice(1);
          if (this.isValidEgyptianNumber(withPrefix)) {
            console.log(`🔧 Fixed with prefix: ${withPrefix}`);
            return withPrefix;
          }
        }
        
        if (i === 1) {
          // Pattern 2: =201 02 083 8442
          const reconstructed = match[1] + match[2] + match[3] + match[4];
          if (this.isValidEgyptianNumber(reconstructed)) {
            return reconstructed;
          }
        }
        
        if (i === 2) {
          // Pattern 3: =+20 102 083 8442
          const reconstructed = match[1] + match[2] + match[3] + match[4];
          if (this.isValidEgyptianNumber(reconstructed)) {
            return reconstructed;
          }
        }
        
        if (i === 3 || i === 4) {
          // Patterns 4 & 5: Direct numbers
          const number = match[1];
          if (this.isValidEgyptianNumber(number)) {
            return number;
          }
        }
        
        if (i === 5) {
          // Pattern 6: Generic - extract all digits and try to reconstruct
          const allDigits = match[1].replace(/[^\d]/g, '');
          console.log(`🔧 Extracted digits: ${allDigits}`);
          
          if (allDigits.length >= 10) {
            const attempts = [
              allDigits,                           // As is
              '01' + allDigits.slice(-9),         // Egyptian mobile
              '201' + allDigits.slice(-9),        // Egyptian international
              allDigits.slice(0, 11),             // First 11 digits
              allDigits.slice(0, 12),             // First 12 digits
              '0' + allDigits.slice(0, 10),       // Add 0 prefix
              '1' + allDigits.slice(0, 10),       // Add 1 prefix
            ];
            
            for (const attempt of attempts) {
              if (this.isValidEgyptianNumber(attempt)) {
                console.log(`✅ SUCCESSFUL RECONSTRUCTION: ${attempt}`);
                return attempt;
              }
            }
            
            // خاص بالمشكلة الحالية: =20 102 083 8442
            if (allDigits === '201020838442') {
              // تجربة تحويلات مختلفة
              const specialAttempts = [
                '01020838442',    // إزالة 20 وإضافة 0
                '201020838442',   // كما هو
                '+201020838442'   // إضافة +
              ];
              
              for (const special of specialAttempts) {
                if (this.isValidEgyptianNumber(special)) {
                  console.log(`✅ SPECIAL CASE SUCCESS: ${special}`);
                  return special;
                }
              }
            }
          }
        }
      }
    }

    console.log(`❌ Could not extract phone from formula: ${formulaValue}`);
    return null;
  }

  /**
   * التحقق من صحة الرقم المصري
   */
  private static isValidEgyptianNumber(number: string): boolean {
    if (!number || typeof number !== 'string') return false;
    
    const cleaned = number.replace(/[^\d]/g, '');
    
    // Egyptian number validation
    // 01XXXXXXXX (11 digits starting with 01)
    if (cleaned.length === 11 && cleaned.startsWith('01')) {
      const prefix = cleaned.substring(0, 3);
      return ['010', '011', '012', '015'].includes(prefix);
    }
    
    // 201XXXXXXXX (12 digits starting with 201)
    if (cleaned.length === 12 && cleaned.startsWith('201')) {
      const prefix = cleaned.substring(0, 4);
      return ['2010', '2011', '2012', '2015'].includes(prefix);
    }
    
    return false;
  }

  /**
   * تجربة استخراج بأنماط متعددة للحالات الصعبة
   */
  static forceExtractPhone(input: string): string | null {
    if (!input || typeof input !== 'string') return null;

    console.log(`🔨 FORCE EXTRACTION from: "${input}"`);

    // استخراج جميع الأرقام
    const allDigits = input.replace(/[^\d]/g, '');
    console.log(`🔢 All digits: ${allDigits}`);

    if (allDigits.length < 10) {
      console.log(`❌ Not enough digits (${allDigits.length})`);
      return null;
    }

    // محاولات قوية للاستخراج
    const forcedAttempts = [
      // Egyptian patterns
      allDigits.startsWith('20') ? '01' + allDigits.slice(2) : null,  // 20XXXXXXXX -> 01XXXXXXXX
      allDigits.startsWith('201') ? '01' + allDigits.slice(3) : null, // 201XXXXXXX -> 01XXXXXXX
      allDigits.length >= 11 ? allDigits.slice(0, 11) : null,         // First 11 digits
      allDigits.length >= 12 ? allDigits.slice(0, 12) : null,         // First 12 digits
      allDigits.length >= 10 ? '01' + allDigits.slice(-9) : null,     // Last 9 + 01
      allDigits.length >= 10 ? '201' + allDigits.slice(-9) : null,    // Last 9 + 201
    ].filter(attempt => attempt !== null);

    for (const attempt of forcedAttempts) {
      if (attempt && this.isValidEgyptianNumber(attempt)) {
        console.log(`✅ FORCE SUCCESS: ${attempt}`);
        return attempt;
      }
    }

    console.log(`❌ Force extraction failed for: ${input}`);
    return null;
  }
} 