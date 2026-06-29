import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit, { type Font, type Path as FontPath } from '@pdf-lib/fontkit';
import {
  degrees,
  drawObject,
  drawSvgPath,
  PDFDocument,
  type PDFOperator,
  type PDFRef,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  rotateDegrees,
  setGraphicsState,
  translate
} from 'pdf-lib';

export interface PdfWatermarkOptions {
  userText: string;
  clientIp: string;
  documentCode: string;
  previewedAt?: Date;
}

interface TransformableFontPath extends FontPath {
  scale(x: number, y?: number): FontPath;
}

interface WatermarkLayout {
  blockWidth: number;
  blockHeight: number;
  fontSize: number;
  lineHeight: number;
  verticalPadding: number;
}

const getFontPath = () =>
  path.join(process.cwd(), 'public', 'fonts', 'NotoSansTC-Bold.ttf');

const formatPreviewTime = (value: Date) => {
  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}:${values.second}`;
};

const getWatermarkLines = (options: PdfWatermarkOptions) => [
  `使用者：${options.userText || '未知使用者'}`,
  `預覽時間：${formatPreviewTime(options.previewedAt || new Date())}`,
  `IP：${options.clientIp || '無法判定'}`,
  `文件編號：${options.documentCode || '-'}`,
  '內部文件，禁止外流'
];

const getLineWidth = (font: Font, text: string, fontSize: number) => {
  const scale = fontSize / font.unitsPerEm;
  return font.layout(text).positions.reduce(
    (width, position) => width + position.xAdvance * scale,
    0
  );
};

const getLayout = (
  font: Font,
  lines: string[],
  pageWidth: number
): WatermarkLayout => {
  const maximumTextWidth = pageWidth * 0.72;
  const maximumLineWidthAtOnePoint = Math.max(
    ...lines.map((line) => getLineWidth(font, line, 1))
  );
  const fontSize = Math.max(
    12,
    Math.min(30, pageWidth / 20, maximumTextWidth / maximumLineWidthAtOnePoint)
  );
  const lineHeight = fontSize * 1.45;
  const verticalPadding = fontSize * 0.3;
  const blockWidth = Math.max(
    ...lines.map((line) => getLineWidth(font, line, fontSize))
  );

  return {
    blockWidth,
    blockHeight: lineHeight * (lines.length - 1) + fontSize +
      verticalPadding * 2,
    fontSize,
    lineHeight,
    verticalPadding
  };
};

const createWatermarkForm = (
  pdfDocument: PDFDocument,
  font: Font,
  lines: string[],
  layout: WatermarkLayout
) => {
  const operators: PDFOperator[] = [];
  const glyphScale = layout.fontSize / font.unitsPerEm;

  lines.forEach((line, lineIndex) => {
    const run = font.layout(line);
    const lineWidth = getLineWidth(font, line, layout.fontSize);
    let penX = (layout.blockWidth - lineWidth) / 2;
    const baselineY = layout.blockHeight - layout.verticalPadding -
      layout.fontSize -
      lineIndex * layout.lineHeight;

    run.glyphs.forEach((glyph, glyphIndex) => {
      const position = run.positions[glyphIndex];
      // pdf-lib 會反轉 SVG 的 Y 軸；先反轉字形路徑，以維持字型原始座標方向。
      const outline = (glyph.path as TransformableFontPath)
        .scale(1, -1)
        .toSVG();

      operators.push(...drawSvgPath(outline, {
        x: penX + position.xOffset * glyphScale,
        y: baselineY + position.yOffset * glyphScale,
        scale: glyphScale,
        color: rgb(17 / 255, 24 / 255, 39 / 255),
        borderColor: undefined,
        borderWidth: 0,
        rotate: degrees(0)
      }));

      penX += position.xAdvance * glyphScale;
    });
  });

  const form = pdfDocument.context.formXObject(operators, {
    BBox: [0, 0, layout.blockWidth, layout.blockHeight]
  });

  return pdfDocument.context.register(form);
};

export const applyPdfWatermark = async (
  source: Uint8Array,
  options: PdfWatermarkOptions
) => {
  const pdfDocument = await PDFDocument.load(source);
  const fontBytes = await readFile(getFontPath());
  const font = fontkit.create(fontBytes);
  const lines = getWatermarkLines(options);
  const rotationDegrees = 24;
  const rotationRadians = rotationDegrees * Math.PI / 180;
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);
  const formCache = new Map<string, {
    layout: WatermarkLayout;
    ref: PDFRef;
  }>();
  const graphicsState = pdfDocument.context.obj({
    Type: 'ExtGState',
    ca: 0.22,
    CA: 0.22
  });
  const graphicsStateRef = pdfDocument.context.register(graphicsState);

  pdfDocument.getPages().forEach((page) => {
    const { width, height } = page.getSize();
    const cacheKey = width.toFixed(3);
    let cachedForm = formCache.get(cacheKey);

    if (!cachedForm) {
      const layout = getLayout(font, lines, width);
      cachedForm = {
        layout,
        ref: createWatermarkForm(pdfDocument, font, lines, layout)
      };
      formCache.set(cacheKey, cachedForm);
    }

    const { blockWidth, blockHeight } = cachedForm.layout;
    const rotatedCorners = [
      { x: 0, y: 0 },
      { x: blockWidth * cos, y: blockWidth * sin },
      { x: -blockHeight * sin, y: blockHeight * cos },
      {
        x: blockWidth * cos - blockHeight * sin,
        y: blockWidth * sin + blockHeight * cos
      }
    ];
    const minimumX = Math.min(...rotatedCorners.map((corner) => corner.x));
    const maximumX = Math.max(...rotatedCorners.map((corner) => corner.x));
    const minimumY = Math.min(...rotatedCorners.map((corner) => corner.y));
    const maximumY = Math.max(...rotatedCorners.map((corner) => corner.y));
    const originX = (width - (maximumX - minimumX)) / 2 - minimumX;
    const originY = (height - (maximumY - minimumY)) / 2 - minimumY;
    const formKey = page.node.newXObject('Watermark', cachedForm.ref);
    const graphicsStateKey = page.node.newExtGState(
      'WatermarkGS',
      graphicsStateRef
    );

    page.pushOperators(
      pushGraphicsState(),
      setGraphicsState(graphicsStateKey),
      translate(originX, originY),
      rotateDegrees(rotationDegrees),
      drawObject(formKey),
      popGraphicsState()
    );
  });

  return pdfDocument.save();
};
