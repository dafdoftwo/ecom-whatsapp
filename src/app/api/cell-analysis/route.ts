import { NextRequest, NextResponse } from 'next/server';
import { DeepCellAnalyzer } from '@/lib/services/deep-cell-analyzer';

export async function GET(request: NextRequest) {
  try {
    console.log('🔬 Starting deep cell analysis API...');
    
    const analysisResult = await DeepCellAnalyzer.analyzeProblemCells();
    
    if (!analysisResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Cell analysis failed',
        cellAnalysis: []
      }, { status: 500 });
    }

    console.log(`✅ Cell analysis complete: ${analysisResult.cellAnalysis.length} problematic cells found`);

    return NextResponse.json({
      success: true,
      message: `Found ${analysisResult.cellAnalysis.length} problematic cells with potential solutions`,
      data: analysisResult.cellAnalysis,
      summary: {
        totalProblematicCells: analysisResult.cellAnalysis.length,
        totalSolutions: analysisResult.cellAnalysis.reduce((sum, cell) => sum + cell.potentialSolutions.length, 0),
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Cell analysis API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Cell analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      cellAnalysis: []
    }, { status: 500 });
  }
} 