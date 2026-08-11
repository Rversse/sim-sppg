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

  const dateInputs = activeSection.querySelectorAll<HTMLInputElement>(
    '.reports-filter-panel input[type="date"]'
  )

  const startDate = dateInputs[0]?.value ?? ''
  const endDate = dateInputs[1]?.value ?? startDate

  const kitchenSelect = activeSection.querySelector<HTMLSelectElement>(
    '.reports-filter-panel select'
  )

  const kitchenName =
    kitchenSelect?.selectedOptions[0]?.textContent?.trim() ?? ''

  /*
   * V1 print menggunakan isi report sebagai sumber, lalu menyembunyikan
   * elemen filter/detail/button khusus print.
   *
   * V2 memakai class berbeda, jadi kita clone section aktif dan buang
   * elemen yang memang tidak boleh masuk hasil cetak.
   */
  const reportClone = activeSection.cloneNode(true) as HTMLElement

  reportClone
    .querySelectorAll(
      '.reports-filter-panel, .reports-detail-list, .reports-detail, .reports-total-row, button'
    )
    .forEach((element) => element.remove())

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
      ? startDate === endDate
        ? `Periode: ${formatPrintDate(startDate)}`
        : `Periode: ${formatPrintDate(startDate)} s/d ${formatPrintDate(endDate)}`
      : startDate
        ? `Periode: ${formatPrintDate(startDate)}`
        : ''

  const kitchen =
    kitchenName && kitchenName !== 'Semua Dapur' ? `Dapur: ${kitchenName}` : ''

  const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>

  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html,
    body {
      width: 100%;
      min-height: 100%;
      background: white;
    }

    body {
      font-family: Arial, sans-serif;
      color: #18293F;
      padding: 22px 28px;
      font-size: 11px;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /*
     * Sama seperti V1:
     * filter, tombol, dan rincian tidak dibawa ke hasil print.
     */
    .reports-filter-panel,
    .reports-detail-list,
    .reports-detail,
    button {
      display: none !important;
    }

    .reports-page {
      width: 100%;
    }

    .reports-header {
      display: block;
      margin-bottom: 18px;
      border-bottom: 2px solid #0D2137;
      padding-bottom: 10px;
    }

    .reports-header h1 {
      font-size: 20px;
      line-height: 1.2;
      margin: 0;
      color: #18293F;
    }

    .reports-header p {
      font-size: 12px;
      color: #637A96;
      margin-top: 4px;
    }

    .print-meta {
      display: flex;
      gap: 18px;
      flex-wrap: wrap;
      margin-top: 5px;
      color: #637A96;
      font-size: 11px;
    }

    .reports-section {
      display: block !important;
      width: 100%;
    }

    .reports-summary-grid {
      display: grid !important;
      grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      gap: 12px !important;
      margin-bottom: 14px !important;
    }

    .reports-summary-grid.reports-summary-single {
      grid-template-columns: 1fr !important;
    }

    .reports-summary-card {
      background: #fff !important;
      border: 1.5px solid #d2daea !important;
      border-radius: 10px !important;
      padding: 14px 16px !important;
      min-height: 0 !important;
      box-shadow: none !important;
      break-inside: avoid;
    }

    .reports-summary-card:nth-child(1) {
      border-left: 5px solid #16a34a !important;
    }

    .reports-summary-card:nth-child(2) {
      border-left: 5px solid #dc2626 !important;
    }

    .reports-summary-card:nth-child(3) {
      border-left: 5px solid #d97706 !important;
    }

    .reports-summary-card:nth-child(4) {
      border-left: 5px solid #2563eb !important;
    }

    .reports-summary-card > span {
      display: block;
      font-size: 10px;
      font-weight: bold;
      text-transform: uppercase;
      color: #637A96;
      margin-bottom: 4px;
    }

    .reports-summary-card > strong {
      display: block;
      font-size: 18px;
      line-height: 1.2;
      margin: 0;
      color: #18293F;
    }

    .reports-summary-card > small {
      display: block;
      font-size: 9px;
      line-height: 1.35;
      color: #637A96;
      margin-top: 5px;
    }

    .reports-summary-card > strong.negative {
      color: #E8404A !important;
    }

    .reports-table-wrapper {
      width: 100% !important;
      overflow: visible !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      background: white !important;
    }

    .reports-table {
      width: 100% !important;
      min-width: 0 !important;
      border-collapse: collapse !important;
      table-layout: auto;
      line-height: 1.4;
    }

    .reports-table th {
      background: #ECF0F6 !important;
      vertical-align: middle;
      color: #637A96 !important;
      font-size: 9px !important;
      text-transform: uppercase;
      padding: 8px 10px !important;
      border-bottom: 2px solid #D2DAEA !important;
      white-space: nowrap;
    }

    .reports-table td {
      font-size: 11px !important;
      padding: 8px 10px !important;
      text-align: center;
      vertical-align: middle;
      border-bottom: 1px solid #D2DAEA !important;
      white-space: nowrap;
      color: #18293F !important;
    }

    .reports-table th:first-child,
    .reports-table td:first-child {
      text-align: left;
    }

    .reports-total-row td {
      font-weight: bold !important;
      background: #ECF0F6 !important;
      border-top: 2px solid #D2DAEA !important;
    }

    .reports-table .positive {
      color: #1DB96A !important;
      font-weight: bold;
    }

    .reports-table .negative {
      color: #E8404A !important;
      font-weight: bold;
    }

    .reports-empty,
    .reports-error {
      border: 1px solid #d2daea !important;
      box-shadow: none !important;
      background: white !important;
    }

    .print-footer {
      margin-top: 18px;
      text-align: right;
      font-size: 10px;
      color: #637A96;
    }
  </style>
</head>

<body>
  <div class="reports-page">
    <header class="reports-header">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle)}</p>

      <div class="print-meta">
        ${period ? `<span>${escapeHtml(period)}</span>` : ''}
        ${kitchen ? `<span>${escapeHtml(kitchen)}</span>` : ''}
      </div>
    </header>

    ${reportClone.outerHTML}

    <div class="print-footer">
      Dicetak:
      ${new Date().toLocaleString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}
    </div>
  </div>
</body>
</html>
`

  /*
   * Ini sengaja mengikuti mekanisme V1:
   * iframe full viewport → write document → print → cleanup.
   */
  const iframe = document.createElement('iframe')

  iframe.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none;
    z-index: 99999;
    background: white;
  `

  document.body.appendChild(iframe)

  const cleanup = () => {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe)
    }
  }

  const { contentDocument, contentWindow } = iframe

  if (!contentDocument || !contentWindow) {
    cleanup()
    return
  }

  contentDocument.open()
  contentDocument.write(html)
  contentDocument.close()

  contentWindow.onafterprint = cleanup

  window.setTimeout(() => {
    contentWindow.focus()
    contentWindow.print()

    // Fallback jika browser tidak memanggil onafterprint.
    window.setTimeout(cleanup, 1000)
  }, 400)
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

export { printReport }
