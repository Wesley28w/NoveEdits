import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Channels } from '../../shared/contracts';
import type { Script } from '../../shared/types';

const ORANGE = rgb(1, 0.416, 0);
const BLACK = rgb(0.07, 0.07, 0.07);
const GRAY = rgb(0.6, 0.6, 0.6);

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 40;
const COL_GAP = 16;

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

async function buildPdf(script: Script): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const bodySize = 10;
  const lineHeight = 13;
  const headerHeight = 70;
  const colWidth = (PAGE_WIDTH - MARGIN * 2 - COL_GAP) / 2;

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN;

  function drawHeader() {
    page.drawText(script.title || 'Untitled Script', {
      x: MARGIN,
      y: cursorY - 18,
      size: 20,
      font: boldFont,
      color: BLACK,
    });
    page.drawRectangle({
      x: MARGIN,
      y: cursorY - 26,
      width: PAGE_WIDTH - MARGIN * 2,
      height: 2,
      color: ORANGE,
    });
    cursorY -= headerHeight;
    // column headers
    page.drawText('SAID', { x: MARGIN, y: cursorY, size: 11, font: boldFont, color: BLACK });
    page.drawText('SHOWN', { x: MARGIN + colWidth + COL_GAP, y: cursorY, size: 11, font: boldFont, color: BLACK });
    cursorY -= lineHeight + 4;
    page.drawRectangle({
      x: MARGIN,
      y: cursorY,
      width: PAGE_WIDTH - MARGIN * 2,
      height: 1,
      color: GRAY,
    });
    cursorY -= 10;
  }

  function newPage() {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursorY = PAGE_HEIGHT - MARGIN;
    drawHeader();
  }

  drawHeader();

  for (const row of script.rows) {
    const saidLines = wrapText(row.said, font, bodySize, colWidth);
    const shownLines = wrapText(row.shown, font, bodySize, colWidth);
    const rowLines = Math.max(saidLines.length, shownLines.length);
    const rowHeight = rowLines * lineHeight + 10;

    if (cursorY - rowHeight < MARGIN) {
      newPage();
    }

    const rowTop = cursorY;
    saidLines.forEach((line, i) => {
      page.drawText(line, {
        x: MARGIN,
        y: rowTop - i * lineHeight,
        size: bodySize,
        font,
        color: BLACK,
      });
    });
    shownLines.forEach((line, i) => {
      page.drawText(line, {
        x: MARGIN + colWidth + COL_GAP,
        y: rowTop - i * lineHeight,
        size: bodySize,
        font,
        color: BLACK,
      });
    });

    cursorY = rowTop - rowHeight;
    page.drawRectangle({
      x: MARGIN,
      y: cursorY + 6,
      width: PAGE_WIDTH - MARGIN * 2,
      height: 0.5,
      color: GRAY,
    });
  }

  return doc.save();
}

export function registerPdfHandlers(): void {
  ipcMain.handle(Channels.pdfExport, async (event, script: Script) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export Script to PDF',
      defaultPath: `${script.title || 'script'}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }
    const bytes = await buildPdf(script);
    fs.writeFileSync(result.filePath, bytes);
    return { canceled: false, filePath: result.filePath };
  });
}
