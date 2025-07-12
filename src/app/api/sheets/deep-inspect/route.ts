import { NextRequest, NextResponse } from 'next/server';
import { GoogleSheetsService } from '@/lib/services/google-sheets';
import { google } from 'googleapis';
import { ConfigService } from '@/lib/services/config';

export async function GET(request: NextRequest) {
  try {
    console.log('🔬 Starting deep inspection of Google Sheets data...');
    
    // Get Google config
    const config = await ConfigService.getGoogleConfig();
    
    if (!config.credentials || !config.spreadsheetUrl) {
      return NextResponse.json({
        success: false,
        error: 'Google configuration not found'
      }, { status: 400 });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: config.credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = config.spreadsheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];
    
    if (!spreadsheetId) {
      return NextResponse.json({
        success: false,
        error: 'Invalid spreadsheet URL'
      }, { status: 400 });
    }

    // 1. Get basic values (what we normally get)
    console.log('📊 Getting basic values...');
    const basicResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A:P',
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING'
    });

    // 2. Get formatted values (what user sees)
    console.log('🎨 Getting formatted values...');
    const formattedResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A:P',
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING'
    });

    // 3. Get formula values (to see actual formulas)
    console.log('📐 Getting formula values...');
    const formulaResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A:P',
      valueRenderOption: 'FORMULA',
      dateTimeRenderOption: 'FORMATTED_STRING'
    });

    // 4. Get detailed cell data with metadata
    console.log('🔍 Getting detailed cell data...');
    const detailedResponse = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: ['A:P'],
      includeGridData: true
    });

    const basicRows = basicResponse.data.values || [];
    const formattedRows = formattedResponse.data.values || [];
    const formulaRows = formulaResponse.data.values || [];
    const detailedData = detailedResponse.data.sheets?.[0]?.data?.[0]?.rowData || [];

    console.log(`🔢 Found ${basicRows.length} rows in basic, ${formattedRows.length} in formatted, ${formulaRows.length} in formula`);

    // Analyze each row with problems
    const analysisResults = [];
    const maxRows = Math.max(basicRows.length, formattedRows.length, formulaRows.length);

    for (let i = 1; i < maxRows && i < 10; i++) { // Analyze first 10 rows (skip header)
      const rowIndex = i + 1; // 1-based indexing
      const basicRow = basicRows[i] || [];
      const formattedRow = formattedRows[i] || [];
      const formulaRow = formulaRows[i] || [];
      const detailedRow = detailedData[i] || {};

      // Focus on phone columns (C and D - indices 2 and 3)
      const phoneColumnC = {
        basic: basicRow[2],
        formatted: formattedRow[2], 
        formula: formulaRow[2],
        detailed: detailedRow.values?.[2]
      };

      const phoneColumnD = {
        basic: basicRow[3],
        formatted: formattedRow[3],
        formula: formulaRow[3], 
        detailed: detailedRow.values?.[3]
      };

      const customerName = formattedRow[1] || basicRow[1] || `Row ${rowIndex}`;

      // Deep analysis for this row
      const analysis = {
        rowIndex,
        customerName,
        phoneColumnC: analyzePhoneColumn(phoneColumnC, 'C'),
        phoneColumnD: analyzePhoneColumn(phoneColumnD, 'D'),
        hasErrors: false,
        extractedNumbers: [] as string[],
        recommendations: [] as string[]
      };

      // Check for errors
      if (hasErrorIndicators(phoneColumnC) || hasErrorIndicators(phoneColumnD)) {
        analysis.hasErrors = true;
        analysis.extractedNumbers = extractAllPossibleNumbers(phoneColumnC, phoneColumnD);
        analysis.recommendations = generateRecommendations(phoneColumnC, phoneColumnD);
      }

      analysisResults.push(analysis);
      
      // Log detailed info for problematic rows
      if (analysis.hasErrors) {
        console.log(`🚨 PROBLEM ROW ${rowIndex} (${customerName}):`);
        console.log(`  📞 Column C:`, JSON.stringify(phoneColumnC, null, 2));
        console.log(`  📱 Column D:`, JSON.stringify(phoneColumnD, null, 2));
        console.log(`  🔧 Extracted numbers:`, analysis.extractedNumbers);
      }
    }

    // Generate comprehensive report
    const report = {
      timestamp: new Date().toISOString(),
      spreadsheetInfo: {
        id: spreadsheetId,
        title: detailedResponse.data.properties?.title,
        totalRows: maxRows
      },
      analysisResults,
      summary: {
        totalRowsAnalyzed: analysisResults.length,
        rowsWithErrors: analysisResults.filter(r => r.hasErrors).length,
        totalExtractedNumbers: analysisResults.reduce((sum, r) => sum + r.extractedNumbers.length, 0)
      },
      rawDataSample: {
        basicSample: basicRows.slice(0, 5),
        formattedSample: formattedRows.slice(0, 5),
        formulaSample: formulaRows.slice(0, 5)
      }
    };

    console.log(`✅ Deep inspection complete. Found ${report.summary.rowsWithErrors} rows with errors`);

    return NextResponse.json({
      success: true,
      report,
      message: `Deep inspection complete - found ${report.summary.rowsWithErrors} problematic rows`
    });

  } catch (error) {
    console.error('❌ Error in deep inspection:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to perform deep inspection',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Helper functions for analysis
function analyzePhoneColumn(columnData: any, columnName: string) {
  return {
    columnName,
    basic: columnData.basic,
    formatted: columnData.formatted,
    formula: columnData.formula,
    cellType: columnData.detailed?.effectiveValue ? Object.keys(columnData.detailed.effectiveValue)[0] : 'unknown',
    cellFormat: columnData.detailed?.effectiveFormat?.numberFormat,
    hasError: hasErrorIndicators(columnData),
    errorType: detectErrorType(columnData),
    possibleNumbers: extractNumbersFromColumn(columnData)
  };
}

function hasErrorIndicators(columnData: any): boolean {
  const values = [columnData.basic, columnData.formatted, columnData.formula];
  return values.some(val => 
    val && typeof val === 'string' && (
      val.includes('#ERROR!') ||
      val.includes('#REF!') ||
      val.includes('#VALUE!') ||
      val.includes('#NAME?') ||
      val.includes('#DIV/0!') ||
      val.includes('Formula parse error')
    )
  );
}

function detectErrorType(columnData: any): string {
  const values = [columnData.basic, columnData.formatted, columnData.formula];
  
  for (const val of values) {
    if (val && typeof val === 'string') {
      if (val.includes('Formula parse error')) return 'FORMULA_PARSE_ERROR';
      if (val.includes('#REF!')) return 'REFERENCE_ERROR';
      if (val.includes('#VALUE!')) return 'VALUE_ERROR';
      if (val.includes('#NAME?')) return 'NAME_ERROR';
      if (val.includes('#DIV/0!')) return 'DIVISION_ERROR';
      if (val.includes('#ERROR!')) return 'GENERIC_ERROR';
    }
  }
  
  return 'NO_ERROR';
}

function extractNumbersFromColumn(columnData: any): string[] {
  const numbers = new Set<string>();
  const values = [columnData.basic, columnData.formatted, columnData.formula];
  
  // Enhanced extraction patterns
  const patterns = [
    /\b(\d{11})\b/g,           // 11 digit numbers
    /\b(01\d{9})\b/g,          // Egyptian mobile
    /\b(\+201\d{9})\b/g,       // International Egyptian
    /\b(201\d{9})\b/g,         // Egyptian without +
    /\b(\d{10})\b/g,           // 10 digit numbers
    /(\d{8,15})/g              // Any sequence 8-15 digits
  ];

  for (const val of values) {
    if (val && typeof val === 'string') {
      for (const pattern of patterns) {
        const matches = [...val.matchAll(pattern)];
        matches.forEach(match => {
          const number = match[1] || match[0];
          if (number && number.length >= 8) {
            numbers.add(number);
          }
        });
      }
    }
  }
  
  return Array.from(numbers);
}

function extractAllPossibleNumbers(columnC: any, columnD: any): string[] {
  const numbersC = extractNumbersFromColumn(columnC);
  const numbersD = extractNumbersFromColumn(columnD);
  return [...new Set([...numbersC, ...numbersD])];
}

function generateRecommendations(columnC: any, columnD: any): string[] {
  const recommendations = [];
  
  if (hasErrorIndicators(columnC)) {
    recommendations.push(`Column C has ${detectErrorType(columnC)} - check formula or data source`);
  }
  
  if (hasErrorIndicators(columnD)) {
    recommendations.push(`Column D has ${detectErrorType(columnD)} - check formula or data source`);
  }
  
  const extractedNumbers = extractAllPossibleNumbers(columnC, columnD);
  if (extractedNumbers.length > 0) {
    recommendations.push(`Found ${extractedNumbers.length} potential phone numbers that can be recovered`);
  } else {
    recommendations.push('No recoverable phone numbers found - check original data source');
  }
  
  return recommendations;
} 