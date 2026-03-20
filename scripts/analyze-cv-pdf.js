#!/usr/bin/env node
/**
 * Extracts text per page from the generated CV PDF and prints a short summary
 * so we can verify page breaks (P1 = Experience, P2 = Courses+Projects, P3 = Education+Hobbies).
 *
 * Run: node scripts/analyze-cv-pdf.js
 * Requires: npm install pdf-parse
 */

const fs = require('fs');
const path = require('path');

const PDF_PATH = path.join(__dirname, '..', 'assets', 'pdf', 'sergei_fedorov_cv.pdf');

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error('PDF not found:', PDF_PATH);
    console.error('Run: npm run cv-pdf');
    process.exit(1);
  }

  const { PDFParse } = require('pdf-parse');
  const data = fs.readFileSync(PDF_PATH);
  const parser = new PDFParse({ data });

  try {
    const info = await parser.getInfo({ parsePageInfo: true });
    const totalPages = info.total;
    console.log('--- CV PDF analysis ---');
    console.log('Total pages:', totalPages);
    console.log('');

    const sectionMarkers = [
      'About me',
      'Experience',
      'Courses, trainings',
      'Projects',
      'Education',
      'Hobbies',
    ];

    for (let p = 1; p <= totalPages; p++) {
      const result = await parser.getText({ partial: [p] });
      const text = (result && result.text) ? result.text : '';
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const firstLines = lines.slice(0, 12);
      const sectionHits = sectionMarkers.filter((s) =>
        text.toLowerCase().includes(s.toLowerCase())
      );
      console.log('=== Page', p, '===');
      console.log('Sections present:', sectionHits.length ? sectionHits.join(', ') : '(none detected)');
      console.log('First lines (up to 12):');
      firstLines.forEach((l) => console.log('  ', l.substring(0, 80) + (l.length > 80 ? '...' : '')));
      console.log('');
    }

    await parser.destroy();
  } catch (err) {
    await parser.destroy().catch(() => {});
    console.error(err);
    process.exit(1);
  }
}

main();
