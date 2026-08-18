import type ExcelJS from 'exceljs'

import type {
  OverallReport,
  IncomeReport,
  SupplierReport
} from './reports-service'

async function loadExcelJS() {
  return import('exceljs')
}

function formatDateForFilename(date: string) {
  return date.replaceAll('-', '')
}

async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer()

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  anchor.click()

  URL.revokeObjectURL(url)
}

function setupWorksheet(worksheet: ExcelJS.Worksheet, landscape = true) {
  worksheet.pageSetup = {
    orientation: landscape ? 'landscape' : 'portrait',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalDpi: 300,
    verticalDpi: 300
  }

  worksheet.views = [
    {
      state: 'frozen',
      ySplit: 1
    }
  ]
}

function createWorkbook(ExcelJSRuntime: typeof ExcelJS) {
  const workbook = new ExcelJSRuntime.Workbook()

  workbook.creator = 'SIM SPPG'
  workbook.created = new Date()

  return workbook
}

function styleHeader(row: ExcelJS.Row) {
  row.font = {
    bold: true,
    color: {
      argb: 'FFFFFFFF'
    }
  }

  row.alignment = {
    horizontal: 'center',
    vertical: 'middle'
  }

  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb: 'FF1F2937'
      }
    }

    cell.border = {
      top: {
        style: 'thin',
        color: {
          argb: 'FFD1D5DB'
        }
      },
      left: {
        style: 'thin',
        color: {
          argb: 'FFD1D5DB'
        }
      },
      bottom: {
        style: 'thin',
        color: {
          argb: 'FFD1D5DB'
        }
      },
      right: {
        style: 'thin',
        color: {
          argb: 'FFD1D5DB'
        }
      }
    }
  })

  row.height = 24
}

function styleBody(worksheet: ExcelJS.Worksheet) {
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return
    }

    row.eachCell((cell) => {
      cell.border = {
        top: {
          style: 'thin',
          color: {
            argb: 'FFE5E7EB'
          }
        },
        left: {
          style: 'thin',
          color: {
            argb: 'FFE5E7EB'
          }
        },
        bottom: {
          style: 'thin',
          color: {
            argb: 'FFE5E7EB'
          }
        },
        right: {
          style: 'thin',
          color: {
            argb: 'FFE5E7EB'
          }
        }
      }

      cell.alignment = {
        vertical: 'middle'
      }
    })
  })
}

function styleTotalRow(row: ExcelJS.Row) {
  row.font = {
    bold: true
  }

  row.eachCell((cell) => {
    cell.border = {
      top: {
        style: 'medium',
        color: {
          argb: 'FF9CA3AF'
        }
      },
      left: {
        style: 'thin',
        color: {
          argb: 'FFD1D5DB'
        }
      },
      bottom: {
        style: 'medium',
        color: {
          argb: 'FF9CA3AF'
        }
      },
      right: {
        style: 'thin',
        color: {
          argb: 'FFD1D5DB'
        }
      }
    }
  })
}

function setCurrencyColumns(worksheet: ExcelJS.Worksheet, columns: number[]) {
  for (const columnNumber of columns) {
    worksheet.getColumn(columnNumber).numFmt = '#,##0'
  }
}

function setColumnWidths(
  worksheet: ExcelJS.Worksheet,
  widths: Record<number, number>
) {
  for (const [columnNumber, width] of Object.entries(widths)) {
    worksheet.getColumn(Number(columnNumber)).width = width
  }
}

function addReportTitle(
  worksheet: ExcelJS.Worksheet,
  title: string,
  startDate: string,
  endDate: string,
  kitchenName?: string
) {
  worksheet.insertRow(1, [title])
  worksheet.mergeCells(1, 1, 1, 5)

  const titleCell = worksheet.getCell(1, 1)

  titleCell.font = {
    bold: true,
    size: 16
  }

  titleCell.alignment = {
    horizontal: 'center',
    vertical: 'middle'
  }

  worksheet.insertRow(2, [`Periode: ${startDate} s/d ${endDate}`])

  if (kitchenName) {
    worksheet.insertRow(3, [`Dapur: ${kitchenName}`])
  }

  const headerRowNumber = kitchenName ? 4 : 3

  worksheet.getRow(headerRowNumber).font = {
    bold: true
  }
}

function addDailyDetailRows(
  worksheet: ExcelJS.Worksheet,
  rows: OverallReport['daily']
) {
  for (const row of rows) {
    worksheet.addRow([
      row.date,
      row.income,
      row.expense,
      row.operational,
      row.remaining
    ])
  }
}

function createOverallDetailSheet(
  workbook: ExcelJS.Workbook,
  report: OverallReport
) {
  const worksheet = workbook.addWorksheet('Detail Harian')

  setupWorksheet(worksheet)
  worksheet.addRow(['Tanggal', 'BGN', 'Supplier', 'OPS', 'Sisa'])
  styleHeader(worksheet.getRow(1))

  addDailyDetailRows(worksheet, report.daily)

  setCurrencyColumns(worksheet, [2, 3, 4, 5])
  setColumnWidths(worksheet, {
    1: 16,
    2: 18,
    3: 18,
    4: 18,
    5: 18
  })
  styleBody(worksheet)
}

function createIncomeDetailSheet(
  workbook: ExcelJS.Workbook,
  report: IncomeReport
) {
  const worksheet = workbook.addWorksheet('Detail Harian')

  setupWorksheet(worksheet)

  worksheet.addRow(['Supplier / Rekening', 'Owner', 'Bank', 'Tanggal', 'Total'])

  styleHeader(worksheet.getRow(1))

  const dates = new Set<string>()

  for (const row of report.rows) {
    for (const date of Object.keys(row.dates)) {
      dates.add(date)
    }
  }

  const sortedDates = [...dates].sort()

  for (const row of report.rows) {
    for (const date of sortedDates) {
      const amount = row.dates[date] ?? 0

      if (amount === 0) {
        continue
      }

      worksheet.addRow([
        row.supplierName,
        row.ownerName,
        row.bank,
        date,
        amount
      ])
    }
  }

  setCurrencyColumns(worksheet, [5])
  setColumnWidths(worksheet, {
    1: 30,
    2: 28,
    3: 32,
    4: 16,
    5: 20
  })
  styleBody(worksheet)
}

function createSupplierDetailSheet(
  workbook: ExcelJS.Workbook,
  report: SupplierReport
) {
  const worksheet = workbook.addWorksheet('Detail Harian')

  setupWorksheet(worksheet)

  worksheet.addRow([
    'Tanggal',
    'Dapur',
    'Arutala',
    'Sukalarang',
    'Aris',
    'Babinsa',
    'OPS',
    'Total'
  ])

  styleHeader(worksheet.getRow(1))

  for (const day of report.dailyRows) {
    for (const row of day.kitchens) {
      worksheet.addRow([
        day.date,
        row.kitchenName,
        row.Arutala,
        row.Sukalarang,
        row.Aris,
        row.Babinsa,
        row.Operational,
        row.Total
      ])
    }
  }

  setCurrencyColumns(worksheet, [3, 4, 5, 6, 7, 8])
  setColumnWidths(worksheet, {
    1: 16,
    2: 28,
    3: 18,
    4: 18,
    5: 18,
    6: 18,
    7: 18,
    8: 18
  })
  styleBody(worksheet)
}

function createOverallSummarySheet(
  workbook: ExcelJS.Workbook,
  report: OverallReport,
  startDate: string,
  endDate: string,
  kitchenName?: string
) {
  const worksheet = workbook.addWorksheet('Laporan Keseluruhan')

  setupWorksheet(worksheet)
  addReportTitle(
    worksheet,
    'LAPORAN KESELURUHAN',
    startDate,
    endDate,
    kitchenName
  )

  const headerRowNumber = kitchenName ? 4 : 3

  worksheet.insertRow(headerRowNumber, [
    'Dapur',
    'BGN',
    'Supplier',
    'OPS',
    'Sisa'
  ])

  styleHeader(worksheet.getRow(headerRowNumber))

  for (const row of report.kitchens) {
    worksheet.addRow([
      row.kitchenName,
      row.income,
      row.expense,
      row.operational,
      row.remaining
    ])
  }

  const totalRow = worksheet.addRow([
    'GRAND TOTAL',
    report.totals.income,
    report.totals.expense,
    report.totals.operational,
    report.totals.remaining
  ])

  styleTotalRow(totalRow)
  setCurrencyColumns(worksheet, [2, 3, 4, 5])
  setColumnWidths(worksheet, {
    1: 30,
    2: 18,
    3: 18,
    4: 18,
    5: 18
  })
  styleBody(worksheet)
}

function createIncomeSummarySheet(
  workbook: ExcelJS.Workbook,
  report: IncomeReport
) {
  const worksheet = workbook.addWorksheet('Rekap Pemasukan')

  setupWorksheet(worksheet)
  worksheet.addRow(['Supplier / Rekening', 'Owner', 'Bank', 'Total'])
  styleHeader(worksheet.getRow(1))

  for (const row of report.rows) {
    worksheet.addRow([row.supplierName, row.ownerName, row.bank, row.total])
  }

  const totalRow = worksheet.addRow(['GRAND TOTAL', '', '', report.grandTotal])

  styleTotalRow(totalRow)
  setCurrencyColumns(worksheet, [4])
  setColumnWidths(worksheet, {
    1: 30,
    2: 28,
    3: 32,
    4: 20
  })
  styleBody(worksheet)
}

function createSupplierSummarySheet(
  workbook: ExcelJS.Workbook,
  report: SupplierReport,
  kitchenName?: string
) {
  const worksheet = workbook.addWorksheet('Rekap Pengeluaran')

  setupWorksheet(worksheet)

  if (kitchenName) {
    worksheet.addRow([`Dapur: ${kitchenName}`])
    worksheet.mergeCells(1, 1, 1, 7)

    const kitchenTitle = worksheet.getCell(1, 1)

    kitchenTitle.font = {
      bold: true,
      size: 14
    }

    kitchenTitle.alignment = {
      horizontal: 'center',
      vertical: 'middle'
    }
  }

  worksheet.addRow([
    'Dapur',
    'Arutala',
    'Sukalarang',
    'Aris',
    'Babinsa',
    'OPS',
    'Total'
  ])

  styleHeader(worksheet.getRow(1))

  for (const row of report.summaryRows) {
    worksheet.addRow([
      row.kitchenName,
      row.Arutala,
      row.Sukalarang,
      row.Aris,
      row.Babinsa,
      row.Operational,
      row.Total
    ])
  }

  const totalRow = worksheet.addRow([
    'GRAND TOTAL',
    report.totals.Arutala,
    report.totals.Sukalarang,
    report.totals.Aris,
    report.totals.Babinsa,
    report.totals.Operational,
    report.totals.Total
  ])

  styleTotalRow(totalRow)
  setCurrencyColumns(worksheet, [2, 3, 4, 5, 6, 7])

  setColumnWidths(worksheet, {
    1: 28,
    2: 18,
    3: 18,
    4: 18,
    5: 18,
    6: 18,
    7: 18
  })

  styleBody(worksheet)
}

export async function exportOverallReport(
  report: OverallReport,
  startDate: string,
  endDate: string,
  kitchenName?: string
) {
  const { default: ExcelJSRuntime } = await loadExcelJS()
  const workbook = createWorkbook(ExcelJSRuntime)

  createOverallSummarySheet(workbook, report, startDate, endDate, kitchenName)
  createOverallDetailSheet(workbook, report)

  const filename = `laporan-keseluruhan-${formatDateForFilename(
    startDate
  )}-${formatDateForFilename(endDate)}.xlsx`

  await downloadWorkbook(workbook, filename)
}

export async function exportIncomeReport(
  report: IncomeReport,
  startDate: string,
  endDate: string
) {
  const { default: ExcelJSRuntime } = await loadExcelJS()
  const workbook = createWorkbook(ExcelJSRuntime)

  createIncomeSummarySheet(workbook, report)
  createIncomeDetailSheet(workbook, report)

  const filename = `rekap-pemasukan-${formatDateForFilename(
    startDate
  )}-${formatDateForFilename(endDate)}.xlsx`

  await downloadWorkbook(workbook, filename)
}

export async function exportSupplierReport(
  report: SupplierReport,
  startDate: string,
  endDate: string,
  kitchenName?: string
) {
  const { default: ExcelJSRuntime } = await loadExcelJS()
  const workbook = createWorkbook(ExcelJSRuntime)

  createSupplierSummarySheet(workbook, report, kitchenName)
  createSupplierDetailSheet(workbook, report)

  const filename = `rekap-pengeluaran-${formatDateForFilename(
    startDate
  )}-${formatDateForFilename(endDate)}.xlsx`

  await downloadWorkbook(workbook, filename)
}
