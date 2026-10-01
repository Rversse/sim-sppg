import type ExcelJS from 'exceljs'

import { BANK_MODULE_START_DATE } from '@/lib/app-config'
import {
  getBankExportTransactions,
  type BankExportTransaction
} from './bank-service'

async function loadExcelJS() {
  return import('exceljs')
}

function formatDateForFilename(date: string) {
  return date.replaceAll('-', '')
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split('-')
  return day + '/' + month + '/' + year
}

function createExcelDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)

  return new Date(Date.UTC(year, month - 1, day))
}

function formatDateRangeLabel(startDate: string, endDate: string) {
  if (startDate === endDate) {
    return formatDisplayDate(startDate)
  }

  return formatDisplayDate(startDate) + ' s/d ' + formatDisplayDate(endDate)
}

function createWorkbook(ExcelJSRuntime: typeof ExcelJS) {
  const workbook = new ExcelJSRuntime.Workbook()

  workbook.creator = 'SIM SPPG'
  workbook.lastModifiedBy = 'SIM SPPG'
  workbook.created = new Date()
  workbook.modified = new Date()

  return workbook
}

function setupWorksheet(worksheet: ExcelJS.Worksheet) {
  worksheet.pageSetup = {
    orientation: 'landscape',
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
      ySplit: 5
    }
  ]

  worksheet.autoFilter = {
    from: 'A5',
    to: 'L5'
  }
}

function styleTitle(worksheet: ExcelJS.Worksheet, title: string) {
  worksheet.mergeCells('A1:L1')

  const cell = worksheet.getCell('A1')
  cell.value = title
  cell.font = {
    bold: true,
    size: 16,
    color: {
      argb: 'FF18293F'
    }
  }
  cell.alignment = {
    horizontal: 'left',
    vertical: 'middle'
  }

  worksheet.getRow(1).height = 26
}

function styleMeta(worksheet: ExcelJS.Worksheet, period: string, note: string) {
  worksheet.mergeCells('A2:L2')
  worksheet.getCell('A2').value = 'Periode: ' + period
  worksheet.getCell('A2').font = {
    bold: true,
    color: {
      argb: 'FF334155'
    }
  }

  worksheet.mergeCells('A3:L3')
  worksheet.getCell('A3').value = note
  worksheet.getCell('A3').font = {
    italic: true,
    size: 10,
    color: {
      argb: 'FF64748B'
    }
  }

  worksheet.mergeCells('A4:L4')
  worksheet.getCell('A4').value = ''

  worksheet.getRow(2).height = 20
  worksheet.getRow(3).height = 20
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 26
  row.font = {
    bold: true,
    color: {
      argb: 'FFFFFFFF'
    },
    size: 10
  }
  row.alignment = {
    horizontal: 'center',
    vertical: 'middle',
    wrapText: true
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
}

function styleBody(
  worksheet: ExcelJS.Worksheet,
  startRow = 6,
  incomingRows?: Set<number>
) {
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < startRow) {
      return
    }

    const incoming = incomingRows?.has(rowNumber) ?? false

    row.height = 21

    row.eachCell((cell, columnNumber) => {
      cell.border = {
        top: {
          style: 'thin',
          color: {
            argb: 'FFE2E8F0'
          }
        },
        left: {
          style: 'thin',
          color: {
            argb: 'FFE2E8F0'
          }
        },
        bottom: {
          style: 'thin',
          color: {
            argb: 'FFE2E8F0'
          }
        },
        right: {
          style: 'thin',
          color: {
            argb: 'FFE2E8F0'
          }
        }
      }

      cell.alignment = {
        vertical: 'middle',
        horizontal: columnNumber >= 9 ? 'right' : 'left'
      }

      if (incoming) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb: 'FFF0FDF4'
          }
        }
      } else if (rowNumber % 2 === 0) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb: 'FFF8FAFC'
          }
        }
      }
    })

    const directionCell = row.getCell(5)
    directionCell.font = {
      bold: true,
      color: {
        argb: incoming ? 'FF15803D' : 'FFB91C1C'
      }
    }
  })
}

function styleSummary(
  worksheet: ExcelJS.Worksheet,
  transactions: BankExportTransaction[]
) {
  const incoming = transactions
    .filter((row) => row.direction === 'in')
    .reduce((sum, row) => sum + row.transferAmount, 0)

  const outgoing = transactions
    .filter((row) => row.direction === 'out')
    .reduce((sum, row) => sum + row.transferAmount, 0)

  const admin = transactions.reduce((sum, row) => sum + row.adminFee, 0)

  const net = transactions.reduce((sum, row) => sum + row.totalMutation, 0)

  const summaryText =
    'Ringkasan: ' +
    transactions.length +
    ' transaksi | Masuk: ' +
    incoming.toLocaleString('id-ID') +
    ' | Keluar: ' +
    outgoing.toLocaleString('id-ID') +
    ' | Admin: ' +
    admin.toLocaleString('id-ID') +
    ' | Bersih: ' +
    net.toLocaleString('id-ID')

  worksheet.getCell('A4').value = summaryText
  worksheet.getCell('A4').font = {
    bold: true,
    size: 10,
    color: {
      argb: 'FF334155'
    }
  }
  worksheet.getCell('A4').alignment = {
    vertical: 'middle',
    horizontal: 'left'
  }
}


function setColumnWidths(worksheet: ExcelJS.Worksheet) {
  const widths: Record<number, number> = {
    1: 14,
    2: 26,
    3: 18,
    4: 20,
    5: 18,
    6: 19,
    7: 34,
    8: 40,
    9: 18,
    10: 17,
    11: 18,
    12: 21
  }

  for (const [column, width] of Object.entries(widths)) {
    worksheet.getColumn(Number(column)).width = width
  }

  worksheet.getColumn(1).numFmt = 'dd/mm/yyyy'
  worksheet.getColumn(9).numFmt = '#,##0'
  worksheet.getColumn(10).numFmt = '#,##0'
  worksheet.getColumn(11).numFmt = '#,##0;[Red]-#,##0'
  worksheet.getColumn(12).numFmt = '#,##0;[Red]-#,##0'
}

function addTransactionsSheet(
  workbook: ExcelJS.Workbook,
  title: string,
  period: string,
  transactions: BankExportTransaction[],
  filter: (transaction: BankExportTransaction) => boolean
) {
  const worksheet = workbook.addWorksheet(title)

  setupWorksheet(worksheet)
  styleTitle(
    worksheet,
    'TRANSAKSI BANK — ' + title.toUpperCase()
  )
  styleMeta(
    worksheet,
    period,
    'Saldo berjalan dihitung sejak ' +
      formatDisplayDate(BANK_MODULE_START_DATE) +
      '. Jam input tidak ditampilkan.'
  )

  worksheet.addRow([
    'Tanggal Transaksi',
    'Rekening',
    'Bank',
    'No. Rekening',
    'Arah',
    'Jenis Mutasi',
    'Dari / Kepada',
    'Keperluan / Catatan',
    'Nominal Transfer',
    'Biaya Admin',
    'Total Mutasi',
    'Saldo Setelah Transaksi'
  ])

  styleHeader(worksheet.getRow(5))

  const filtered = transactions.filter(filter)
  const incomingRows = new Set<number>()

  filtered.forEach((transaction, index) => {
    const excelRow = index + 6

    if (transaction.direction === 'in') {
      incomingRows.add(excelRow)
    }

    worksheet.addRow([
      createExcelDate(transaction.transactionDate),
      transaction.accountName,
      transaction.bank,
      transaction.accountNumber || '-',
      transaction.direction === 'in' ? 'MASUK' : 'KELUAR',
      transaction.mutationType,
      transaction.counterparty,
      transaction.paymentFor,
      transaction.transferAmount,
      transaction.adminFee,
      transaction.totalMutation,
      transaction.balanceAfter
    ])
  })

  styleBody(worksheet, 6, incomingRows)
  setColumnWidths(worksheet)
  styleSummary(worksheet, filtered)

  worksheet.getColumn(5).alignment = {
    horizontal: 'center',
    vertical: 'middle'
  }

  worksheet.getColumn(6).alignment = {
    horizontal: 'center',
    vertical: 'middle'
  }

  worksheet.getColumn(9).alignment = {
    horizontal: 'right',
    vertical: 'middle'
  }

  worksheet.getColumn(10).alignment = {
    horizontal: 'right',
    vertical: 'middle'
  }

  worksheet.getColumn(11).alignment = {
    horizontal: 'right',
    vertical: 'middle'
  }

  worksheet.getColumn(12).alignment = {
    horizontal: 'right',
    vertical: 'middle'
  }

  return worksheet
}

export async function exportBankTransactions(
  startDate: string,
  endDate: string
) {
  const transactions = await getBankExportTransactions(startDate, endDate)
  const { default: ExcelJSRuntime } = await loadExcelJS()
  const workbook = createWorkbook(ExcelJSRuntime)
  const period = formatDateRangeLabel(startDate, endDate)

  addTransactionsSheet(
    workbook,
    'Semua Mutasi',
    period,
    transactions,
    () => true
  )

  addTransactionsSheet(
    workbook,
    'Transaksi Masuk',
    period,
    transactions,
    (transaction) => transaction.direction === 'in'
  )

  addTransactionsSheet(
    workbook,
    'Transaksi Keluar',
    period,
    transactions,
    (transaction) => transaction.direction === 'out'
  )

  const filename =
    'transaksi-bank-' +
    formatDateForFilename(startDate) +
    '-' +
    formatDateForFilename(endDate) +
    '.xlsx'

  const buffer = await workbook.xlsx.writeBuffer()

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  anchor.click()

  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
