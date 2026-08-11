function printReport() {
  const reportPage = document.querySelector<HTMLElement>('.reports-page')

  if (!reportPage) {
    console.error('Reports page tidak ditemukan')
    return
  }

  const activeSection =
    reportPage.querySelector<HTMLElement>('.reports-section')

  if (!activeSection) {
    console.error('Report aktif tidak ditemukan')
    return
  }

  const startDate =
    activeSection.querySelector<HTMLInputElement>(
      '.reports-filter-panel input[type="date"]'
    )?.value ?? ''

  const dateInputs = activeSection.querySelectorAll<HTMLInputElement>(
    '.reports-filter-panel input[type="date"]'
  )

  const endDate = dateInputs[1]?.value ?? startDate

  const kitchenSelect = activeSection.querySelector<HTMLSelectElement>(
    '.reports-filter-panel select'
  )

  const kitchenName =
    kitchenSelect?.selectedOptions[0]?.textContent?.trim() ?? ''

  const reportClone = activeSection.cloneNode(true) as HTMLElement

  // Print hanya report utama.
  reportClone
    .querySelectorAll(
      '.reports-filter-panel, .reports-detail-list, .reports-detail'
    )
    .forEach((element) => element.remove())

  // Buang tombol apa pun yang mungkin ada di dalam report.
  reportClone.querySelectorAll('button').forEach((element) => {
    element.remove()
  })

  const title =
    reportPage
      .querySelector<HTMLElement>('.reports-header h1')
      ?.textContent?.trim() ?? 'Laporan & Rekap'

  const subtitle =
    reportPage
      .querySelector<HTMLElement>('.reports-header p')
      ?.textContent?.trim() ?? ''

  const period =
    startDate && endDate
      ? `Periode: ${formatPrintDate(startDate)} s/d ${formatPrintDate(endDate)}`
      : ''

  const kitchen =
    kitchenName && kitchenName !== 'Semua Dapur' ? `Dapur: ${kitchenName}` : ''

  const html = `
    <!doctype html>
    <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(title)}</title>

        <style>
          @page {
            size: A4 landscape;
            margin: 10mm;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            margin: 0;
            padding: 0;
            background: #fff;
          }

          body {
            font-family:
              Inter,
              ui-sans-serif,
              system-ui,
              -apple-system,
              BlinkMacSystemFont,
              "Segoe UI",
              sans-serif;
            color: #0f172a;
            font-size: 10px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .print-page {
            width: 100%;
          }

          .print-header {
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #0f172a;
          }

          .print-header h1 {
            margin: 0;
            font-size: 20px;
            line-height: 1.15;
            font-weight: 800;
            color: #0f172a;
          }

          .print-header p {
            margin: 4px 0 0;
            color: #64748b;
            font-size: 10px;
          }

          .print-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 4px 18px;
            margin-top: 5px;
            color: #475569;
            font-size: 10px;
            font-weight: 600;
          }

          .reports-section {
            display: block !important;
          }

          .reports-summary-grid {
            display: grid !important;
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 8px !important;
            margin-bottom: 10px !important;
          }

          .reports-summary-grid.reports-summary-single {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .reports-summary-card {
            min-height: auto !important;
            padding: 10px 12px !important;
            border: 1px solid #dbe3ed !important;
            border-radius: 8px !important;
            background: #fff !important;
            box-shadow: none !important;
            break-inside: avoid;
          }

          .reports-summary-card > span {
            display: block;
            color: #64748b;
            font-size: 8px;
            font-weight: 800;
            text-transform: uppercase;
          }

          .reports-summary-card > strong {
            display: block;
            margin-top: 6px;
            color: #0f172a;
            font-size: 15px;
            line-height: 1.15;
          }

          .reports-table-wrapper {
            width: 100%;
            overflow: visible !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 7px !important;
            box-shadow: none !important;
          }

          .reports-table {
            width: 100% !important;
            min-width: 0 !important;
            border-collapse: collapse !important;
            font-size: 9px !important;
          }

          .reports-table th,
          .reports-table td {
            padding: 6px 8px !important;
            border: 1px solid #dbe3ed !important;
            white-space: nowrap;
          }

          .reports-table th {
            background: #f1f5f9 !important;
            color: #475569 !important;
            font-size: 8px !important;
            font-weight: 800 !important;
            text-transform: uppercase;
          }

          .reports-table td {
            color: #0f172a !important;
          }

          .reports-table .positive {
            color: #16a34a !important;
            font-weight: 700;
          }

          .reports-table .negative {
            color: #dc2626 !important;
            font-weight: 700;
          }

          .reports-total-row td {
            background: #f8fafc !important;
            color: #0f172a !important;
            font-weight: 800 !important;
            border-top: 2px solid #0f172a !important;
          }

          .reports-empty,
          .reports-error {
            border: 1px solid #cbd5e1 !important;
            box-shadow: none !important;
          }
        </style>
      </head>

      <body>
        <main class="print-page">
          <header class="print-header">
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(subtitle)}</p>

            <div class="print-meta">
              ${period ? `<span>${escapeHtml(period)}</span>` : ''}
              ${kitchen ? `<span>${escapeHtml(kitchen)}</span>` : ''}
            </div>
          </header>

          ${reportClone.outerHTML}
        </main>
      </body>
    </html>
  `

  const iframe = document.createElement('iframe')

  iframe.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    opacity: 0;
    pointer-events: none;
    z-index: 99999;
  `

  document.body.appendChild(iframe)

  const contentDocument = iframe.contentDocument
  const contentWindow = iframe.contentWindow

  if (!contentDocument || !contentWindow) {
    iframe.remove()
    return
  }

  let cleaned = false

  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    iframe.remove()
  }

  contentWindow.addEventListener('afterprint', cleanup, { once: true })

  contentDocument.open()
  contentDocument.write(html)
  contentDocument.close()

  window.setTimeout(() => {
    contentWindow.focus()
    contentWindow.print()

    // Fallback untuk browser yang tidak mengirim afterprint.
    window.setTimeout(cleanup, 1500)
  }, 250)
}

function formatPrintDate(value: string) {
  const [year, month, day] = value.split('-')

  if (!year || !month || !day) {
    return value
  }

  return `${day}/${month}/${year}`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

// Alias supaya kompatibel dengan pemanggilan Print yang sudah ada.
export const printReports = printReport
export const printOverallReport = printReport
export const printIncomeReport = printReport
export const printExpenseReport = printReport

export { printReport }
