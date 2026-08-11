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

export async function exportOverallReport(
  report: OverallReport,
  startDate: string,
  endDate: string,
  kitchenName?: string
) {
  const { default: ExcelJSRuntime } = await loadExcelJS()
  const workbook = new ExcelJSRuntime.Workbook()

  workbook.creator = 'SIM SPPG'
  workbook.created = new Date()

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

  worksheet.getColumn(1).width = 30
  worksheet.getColumn(2).width = 18
  worksheet.getColumn(3).width = 18
  worksheet.getColumn(4).width = 18
  worksheet.getColumn(5).width = 18

  styleBody(worksheet)

  const detailSheet = workbook.addWorksheet('Detail Harian')

  setupWorksheet(detailSheet)

  detailSheet.addRow(['Tanggal', 'BGN', 'Supplier', 'OPS', 'Sisa'])

  styleHeader(detailSheet.getRow(1))

  for (const row of report.daily) {
    detailSheet.addRow([
      row.date,
      row.income,
      row.expense,
      row.operational,
      row.remaining
    ])
  }

  setCurrencyColumns(detailSheet, [2, 3, 4, 5])

  detailSheet.getColumn(1).width = 16
  detailSheet.getColumn(2).width = 18
  detailSheet.getColumn(3).width = 18
  detailSheet.getColumn(4).width = 18
  detailSheet.getColumn(5).width = 18

  styleBody(detailSheet)

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
  const workbook = new ExcelJSRuntime.Workbook()

  workbook.creator = 'SIM SPPG'
  workbook.created = new Date()

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

  worksheet.getColumn(1).width = 30
  worksheet.getColumn(2).width = 28
  worksheet.getColumn(3).width = 32
  worksheet.getColumn(4).width = 20

  styleBody(worksheet)

  const detailSheet = workbook.addWorksheet('Detail Harian')

  setupWorksheet(detailSheet)

  detailSheet.addRow([
    'Supplier / Rekening',
    'Owner',
    'Bank',
    'Tanggal',
    'Total'
  ])

  styleHeader(detailSheet.getRow(1))

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

      detailSheet.addRow([
        row.supplierName,
        row.ownerName,
        row.bank,
        date,
        amount
      ])
    }
  }

  setCurrencyColumns(detailSheet, [5])

  detailSheet.getColumn(1).width = 30
  detailSheet.getColumn(2).width = 28
  detailSheet.getColumn(3).width = 32
  detailSheet.getColumn(4).width = 16
  detailSheet.getColumn(5).width = 20

  styleBody(detailSheet)

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
  const workbook = new ExcelJSRuntime.Workbook()

  workbook.creator = 'SIM SPPG'
  workbook.created = new Date()

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

  worksheet.getColumn(1).width = 28

  for (let column = 2; column <= 7; column += 1) {
    worksheet.getColumn(column).width = 18
  }

  styleBody(worksheet)

  const detailSheet = workbook.addWorksheet('Detail Harian')

  setupWorksheet(detailSheet)

  detailSheet.addRow([
    'Tanggal',
    'Dapur',
    'Arutala',
    'Sukalarang',
    'Aris',
    'Babinsa',
    'OPS',
    'Total'
  ])

  styleHeader(detailSheet.getRow(1))

  for (const day of report.dailyRows) {
    for (const row of day.kitchens) {
      detailSheet.addRow([
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

  setCurrencyColumns(detailSheet, [3, 4, 5, 6, 7, 8])

  detailSheet.getColumn(1).width = 16
  detailSheet.getColumn(2).width = 28

  for (let column = 3; column <= 8; column += 1) {
    detailSheet.getColumn(column).width = 18
  }

  styleBody(detailSheet)

  const filename = `rekap-pengeluaran-${formatDateForFilename(
    startDate
  )}-${formatDateForFilename(endDate)}.xlsx`

  await downloadWorkbook(workbook, filename)
}
