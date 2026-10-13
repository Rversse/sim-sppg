import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMakerAmount,
  parseMakerDate,
  parseMakerDocument
} from '../src/features/maker-import/maker-import-utils.ts'

test('amount parser keeps Maker integer IDR semantics without scaling', () => {
  assert.equal(parseMakerAmount('241'), 241)
  assert.equal(parseMakerAmount('241.000'), 241000)
  assert.equal(parseMakerAmount('1.234.567'), 1234567)
  assert.equal(parseMakerAmount('Rp 241.000'), 241000)
  assert.equal(parseMakerAmount(''), null)
  assert.equal(parseMakerAmount('12..000'), null)
  assert.equal(parseMakerAmount('241abc'), null)
  assert.equal(parseMakerAmount('0'), null)
})

test('date parser validates real calendar dates', () => {
  assert.equal(parseMakerDate('05-Oct-2026'), '2026-10-05')
  assert.equal(parseMakerDate('31-Feb-2026'), null)
  assert.equal(parseMakerDate('05-XYZ-2026'), null)
})

test('Maker document parses supported rows and preserves exact source coordinates', () => {
  const source = [
    'Cisepat, 05-Oct-2026',
    '',
    'RAB : CV KRAMAT - BNI / 1908102325 · Beras · 241.000',
    'GAS : KOPERASI ARUTALA - BNI / 1985322260 · 124.000',
    'Sewa SPPG : Robi Sulaeman - BNI / 2025279933 · 3.000.000',
    'Gaji Relawan : Robi Sulaeman - BNI / 2025279933 · 2.000.000',
    'Insentif PIC Sekolah : Robi Sulaeman - BNI / 2025279933 · 500.000',
    'Insentif PIC Posyandu : Robi Sulaeman - BNI / 2025279933 · 300.000',
    'Sewa Kendaraan Mobil (05-Oct-2026 – 05-Nov-2026) : Berkah Mandiri Putra - MANDIRI / 1820015963523 · 1.000.000',
    'Ops Harian : Lia Ariska - BNI / 1688603689 · 100.000',
    'Lain-lain : Biaya Ops Harian - Robi Sulaeman - BNI / 2025279933 · 50.000',
    'Gaji Relawan, Insentif PIC Sekolah, Insentif PIC Posyandu : Melan Fitriani - BNI / 2035516850 · 8.000.000'
  ].join('\n')

  const parsed = parseMakerDocument(source)
  assert.equal(parsed.error, null)
  assert.equal(parsed.kitchenName, 'Cisepat')
  assert.equal(parsed.transactionDate, '2026-10-05')
  assert.equal(parsed.rows.length, 10)
  assert.equal(parsed.rows[0].lineNumber, 3)
  assert.equal(parsed.rows[0].kind, 'rab')
  assert.equal(parsed.rows[0].amount, 241000)
  assert.equal(parsed.rows[0].details, 'Beras')
  assert.equal(parsed.rows[1].kind, 'gas')
  assert.equal(parsed.rows[2].kind, 'sppg_rent')
  assert.equal(parsed.rows[3].kind, 'relawan_salary')
  assert.equal(parsed.rows[4].kind, 'pic_school')
  assert.equal(parsed.rows[5].kind, 'pic_posyandu')
  assert.equal(parsed.rows[6].kind, 'vehicle_rent')
  assert.equal(parsed.rows[6].details, 'Periode sewa: 05-Oct-2026 – 05-Nov-2026')
  assert.equal(parsed.rows[7].kind, 'ops_harian')
  assert.equal(parsed.rows[8].kind, 'lain_lain')
  assert.equal(parsed.rows[8].recipientName, 'Robi Sulaeman')
  assert.equal(parsed.rows[8].details, 'Biaya Ops Harian')
  assert.equal(parsed.rows[9].kind, 'combined_payroll')
  assert.equal(parsed.rows[9].amount, 8000000)
  assert.equal(parsed.rows[9].sourceRecipientName, 'Melan Fitriani')
})

test('document parser rejects an invalid header date instead of guessing', () => {
  const parsed = parseMakerDocument('Cisepat, 31-Feb-2026\nRAB : CV KRAMAT - BNI / 1908102325 · 241.000')
  assert.equal(parsed.error, 'Tanggal pada header tidak valid.')
  assert.equal(parsed.rows.length, 0)
})
