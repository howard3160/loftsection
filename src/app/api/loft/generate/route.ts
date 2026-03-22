import { NextRequest, NextResponse } from 'next/server';
import { generate, GenerateInput } from '@/lib/loftCalculations';

/**
 * POST /api/loft/generate
 * 後端核心計算函數
 * 接收參數：W, H, R, D, NUM, NP, interpMode
 * 返回：曲線數據、方程式、狀態信息
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateInput;

    // 驗證參數
    if (
      body.W === undefined ||
      body.H === undefined ||
      body.R === undefined ||
      body.D === undefined ||
      body.NUM === undefined ||
      body.NP === undefined ||
      !body.interpMode
    ) {
      return NextResponse.json(
        { error: '缺少必要參數' },
        { status: 400 }
      );
    }

    // 驗證參數範圍
    if (body.W <= 0 || body.H <= 0 || body.D <= 0 || body.NUM < 1 || body.NP < 256) {
      return NextResponse.json(
        { error: '參數值不合法' },
        { status: 400 }
      );
    }

    // 執行計算
    const result = generate(body);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Loft generation error:', error);
    return NextResponse.json(
      { error: '生成失敗：' + (error instanceof Error ? error.message : '未知錯誤') },
      { status: 500 }
    );
  }
}

