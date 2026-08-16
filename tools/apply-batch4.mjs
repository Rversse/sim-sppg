import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()

function pathFor(relativePath) {
  return resolve(root, relativePath)
}

function read(relativePath) {
  return readFileSync(pathFor(relativePath), 'utf8')
}

function write(relativePath, content) {
  writeFileSync(pathFor(relativePath), content, 'utf8')
}

function replaceOnce(content, find, replacement, label) {
  const index = content.indexOf(find)

  if (index === -1) {
    throw new Error(`Batch 4: anchor not found: ${label}`)
  }

  return content.slice(0, index) + replacement + content.slice(index + find.length)
}

function replaceRegex(content, regex, replacement, label) {
  const next = content.replace(regex, replacement)

  if (next === content) {
    throw new Error(`Batch 4: regex anchor not found: ${label}`)
  }

  return next
}

const dashboardPath = 'src/pages/DashboardPage.tsx'
const reportsPath = 'src/pages/ReportsPage.tsx'
const indexPath = 'src/index.css'
const dashboardCssPath = 'src/styles/dashboard.css'
const reportsCssPath = 'src/styles/reports.css'

let dashboard = read(dashboardPath)

dashboard = replaceOnce(
  dashboard,
  `import {
  getAccountsForFlow,
  getAvailableTransactionFlows,
  getDefaultOperationalAccount,
  getDefaultSupplier,
  getSuppliersForKitchen,
  type TransactionOption
} from '@/features/transactions/transaction-options-service'
`,
  `import {
  getAccountsForFlow,
  getAvailableTransactionFlows,
  getDefaultOperationalAccount,
  getDefaultSupplier,
  getSuppliersForKitchen,
  type TransactionOption
} from '@/features/transactions/transaction-options-service'
import { DateRangePicker } from '@/components/ui/date-range-picker'
`,
  'Dashboard DateRangePicker import'
)

dashboard = replaceOnce(
  dashboard,
  `  function handleStartDate(value: string) {
    setTransactionPage(1)
    setFilters((current) => ({
      ...current,
      startDate: value,
      endDate: value,
      supplierFilter: ''
    }))
  }
`,
  `  function handleDateRangeChange({
    startDate,
    endDate
  }: {
    startDate: string
    endDate: string
  }) {
    setTransactionPage(1)
    setFilters((current) => ({
      ...current,
      startDate,
      endDate,
      supplierFilter: ''
    }))
  }
`,
  'Dashboard date handler'
)

dashboard = replaceOnce(
  dashboard,
  `          <label>
            <span>Mulai</span>
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) => handleStartDate(event.target.value)}
            />
          </label>

          <label>
            <span>Sampai</span>
            <input
              type="date"
              min={filters.startDate}
              value={filters.endDate}
              onChange={(event) =>
                updateFilter(
                  'endDate',
                  event.target.value < filters.startDate
                    ? filters.startDate
                    : event.target.value
                )
              }
            />
          </label>
`,
  `          <DateRangePicker
            className="dashboard-date-range-field"
            value={{
              startDate: filters.startDate,
              endDate: filters.endDate
            }}
            onChange={handleDateRangeChange}
          />
`,
  'Dashboard date inputs'
)

write(dashboardPath, dashboard)

let reports = read(reportsPath)

reports = replaceOnce(
  reports,
  `import { printReport } from '@/features/report/report-print'
`,
  `import { printReport } from '@/features/report/report-print'
import {
  DateRangePicker,
  type DateRangeValue
} from '@/components/ui/date-range-picker'
`,
  'Reports DateRangePicker import'
)

reports = replaceRegex(
  reports,
  /function DateFilter\(\{[\s\S]*?\n\}\n\nfunction KitchenFilter/s,
  `function DateFilter({
  startDate,
  endDate,
  onChange
}: {
  startDate: string
  endDate: string
  onChange: (value: DateRangeValue) => void
}) {
  return (
    <div className="reports-date-range-field">
      <DateRangePicker
        value={{ startDate, endDate }}
        onChange={onChange}
      />
    </div>
  )
}

function KitchenFilter`,
  'Reports DateFilter component'
)

reports = replaceRegex(
  reports,
  /\n  async function loadReport\(\) \{[\s\S]*?\n  \}\n\n  useEffect/s,
  '\n  useEffect',
  'Reports loadReport #1'
)

reports = replaceRegex(
  reports,
  /\n  async function loadReport\(\) \{[\s\S]*?\n  \}\n\n  useEffect/s,
  '\n  useEffect',
  'Reports loadReport #2'
)

reports = replaceRegex(
  reports,
  /\n  async function loadReport\(\) \{[\s\S]*?\n  \}\n\n  useEffect/s,
  '\n  useEffect',
  'Reports loadReport #3'
)

reports = replaceOnce(
  reports,
  `    void getOverallReport({
      startDate: today,
      endDate: today,
      kitchenId: selectedKitchen
    })
`,
  `    void getOverallReport({
      startDate,
      endDate,
      kitchenId: selectedKitchen
    })
`,
  'Overall report query dates'
)

reports = replaceOnce(
  reports,
  `  }, [selectedKitchen, today])`,
  `  }, [selectedKitchen, startDate, endDate])`,
  'Overall report effect deps'
)

reports = replaceOnce(
  reports,
  `    void getSupplierReport({
      startDate: initialDates.startDate,
      endDate: initialDates.endDate,
      kitchenId: selectedKitchen
    })
`,
  `    void getSupplierReport({
      startDate,
      endDate,
      kitchenId: selectedKitchen
    })
`,
  'Supplier report query dates'
)

reports = replaceOnce(
  reports,
  `  }, [selectedKitchen, initialDates])`,
  `  }, [selectedKitchen, startDate, endDate])`,
  'Supplier report effect deps'
)

reports = replaceRegex(
  reports,
  /<DateFilter\s+startDate=\{startDate\}\s+endDate=\{endDate\}\s+onStartDateChange=\{setStartDate\}\s+onEndDateChange=\{setEndDate\}\s+onApply=\{\(\) => void loadReport\(\)\}\s+\/>/g,
  `<DateFilter
          startDate={startDate}
          endDate={endDate}
          onChange={({ startDate: nextStartDate, endDate: nextEndDate }) => {
            setStartDate(nextStartDate)
            setEndDate(nextEndDate)
          }}
        />`,
  'Reports DateFilter usages'
)

write(reportsPath, reports)

let indexCss = read(indexPath)

indexCss = replaceOnce(
  indexCss,
  `@import './styles/page-shared.css';
`,
  `@import './styles/page-shared.css';
@import './components/ui/date-range-picker.css';
`,
  'DateRangePicker stylesheet import'
)

write(indexPath, indexCss)

let dashboardCss = read(dashboardCssPath)

if (!dashboardCss.includes('BATCH 4 — DASHBOARD DATE RANGE')) {
  dashboardCss += `

/* =========================================================
   BATCH 4 — DASHBOARD DATE RANGE
   ========================================================= */

.dashboard-filter-grid {
  grid-template-columns:
    minmax(240px, 1.45fr)
    repeat(3, minmax(0, 1fr));
}

.dashboard-date-range-field {
  min-width: 0;
}

.dashboard-date-range-field .date-range-popover {
  left: 0;
}

@media (max-width: 1100px) {
  .dashboard-filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard-date-range-field {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .dashboard-filter-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-date-range-field {
    grid-column: auto;
  }
}
`
}

write(dashboardCssPath, dashboardCss)

let reportsCss = read(reportsCssPath)

if (!reportsCss.includes('BATCH 4 — REPORTS DATE RANGE')) {
  reportsCss += `

/* =========================================================
   BATCH 4 — REPORTS DATE RANGE
   ========================================================= */

.reports-filter-panel {
  grid-template-columns:
    minmax(250px, 1.8fr)
    minmax(180px, 1fr)
    auto
    auto;
}

.reports-filter-panel > .reports-date-range-field {
  grid-column: 1 !important;
}

.reports-filter-panel > label {
  grid-column: 2 !important;
}

.reports-filter-panel > button:nth-of-type(1) {
  grid-column: 3 !important;
}

.reports-filter-panel > button:nth-of-type(2) {
  grid-column: 4 !important;
}

.reports-date-range-field {
  min-width: 0;
}

@media (max-width: 1100px) {
  .reports-filter-panel {
    grid-template-columns: minmax(230px, 1.5fr) minmax(180px, 1fr) auto !important;
  }

  .reports-filter-panel > .reports-date-range-field {
    grid-column: 1 !important;
  }

  .reports-filter-panel > label {
    grid-column: 2 !important;
  }

  .reports-filter-panel > button:nth-of-type(1) {
    grid-column: 3 !important;
  }

  .reports-filter-panel > button:nth-of-type(2) {
    grid-column: 3 !important;
    grid-row: 2 !important;
  }
}

@media (max-width: 760px) {
  .reports-filter-panel {
    grid-template-columns: 1fr !important;
  }

  .reports-filter-panel > .reports-date-range-field,
  .reports-filter-panel > label,
  .reports-filter-panel > button:nth-of-type(1),
  .reports-filter-panel > button:nth-of-type(2) {
    grid-column: auto !important;
    grid-row: auto !important;
  }
}
`
}

write(reportsCssPath, reportsCss)

console.log('Batch 4 codemod completed.')
