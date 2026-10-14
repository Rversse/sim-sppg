import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMakerAmount,
  parseMakerDate,
  parseMakerDocument
} from '../src/features/maker-import/maker-import-utils.ts'

test('IDR amounts preserve scale and reject malformed separators', () => {
  assert.equal(parseMakerAmount('241'), 241)
  assert.equal(parseMakerAmount('241.000'), 241000)
  assert.equal(parseMakerAmount('1.234.567'), 1234567)
  assert.equal(parseMakerAmount('Rp 1.234.567'), 1234567)
  assert.equal(parseMakerAmount('1.23'), null)
  assert.equal(parseMakerAmount('241,000'), null)
  assert.equal(parseMakerAmount('1.0000'), null)
  assert.equal(parseMakerAmount('0'), null)
})

test('Maker dates accept valid abbreviated months and reject impossible dates', () => {
  assert.equal(parseMakerDate('05-Oct-2026'), '2026-10-05')
  assert.equal(parseMakerDate('5-Jan-2026'), '2026-01-05')
  assert.equal(parseMakerDate('29-Feb-2024'), '2024-02-29')
  assert.equal(parseMakerDate('29-Feb-2025'), null)
  assert.equal(parseMakerDate('32-Oct-2026'), null)
  assert.equal(parseMakerDate('05-Okt-2026'), null)
})

test('Maker parser classifies common output and retains the exact integer amount', () => {
  const source = [
    'Campakamulya, 05-Oct-2026',
    'RAB : CV TEST - BNI / 1111 · Beras, Minyak · 241.000',
    'GAS : KOPERASI TEST - BNI / 2222 · 124.000',
    'Sewa SPPG : PIC Tes - BRI / 3333 · 125.000',
    'Gaji Relawan, Insentif PIC Sekolah, Insentif PIC Posyandu : PIC Tes - BRI / 3333 · 1.000.000',
    'Sewa Kendaraan Mobil (01-Oct-2026 - 31-Oct-2026) : Berkah Test - MANDIRI / 4444 · 500.000',
    'Ops Harian : Petugas Test - BRI / 5555 · 20.000',
    'Lain-lain : Biaya Ops Harian - Penerima Test - BNI / 000123 · 10.000'
  ].join('\n')
  const parsed = parseMakerDocument(source)
  assert.equal(parsed.error, null)
  assert.equal(parsed.kitchenName, 'Campakamulya')
  assert.equal(parsed.transactionDate, '2026-10-05')
  assert.equal(parsed.rows.length, 7)
  assert.equal(parsed.rows[0].kind, 'rab')
  assert.equal(parsed.rows[0].amount, 241000)
  assert.equal(parsed.rows[0].details, 'Beras, Minyak')
  assert.equal(parsed.rows[0].lineNumber, 2)
  assert.equal(parsed.rows[1].kind, 'gas')
  assert.equal(parsed.rows[1].amount, 124000)
  assert.equal(parsed.rows[2].kind, 'sppg_rent')
  assert.equal(parsed.rows[2].recipientName, 'PIC Tes')
  assert.equal(parsed.rows[3].kind, 'combined_payroll')
  assert.equal(parsed.rows[3].amount, 1000000)
  assert.equal(parsed.rows[4].kind, 'vehicle_rent')
  assert.match(parsed.rows[4].details, /Jenis kendaraan: Mobil/)
  assert.match(parsed.rows[4].details, /Periode sewa: 01-Oct-2026 - 31-Oct-2026/)
  assert.equal(parsed.rows[5].kind, 'ops_harian')
  assert.equal(parsed.rows[5].manualFlow, 'ops_disbursement')
  assert.equal(parsed.rows[5].recipientName, 'Petugas Test')
  assert.equal(parsed.rows[6].kind, 'lain_lain')
  assert.equal(parsed.rows[6].details, 'Biaya Ops Harian')
  assert.equal(parsed.rows[6].recipientName, 'Penerima Test')
  assert.equal(parsed.rows[6].accountNumber, '000123')
})

test('Maker parser rejects invalid headers and preserves physical source line numbers', () => {
  const malformed = parseMakerDocument('Campakamulya, 05-Okt-2026\nGAS : KOPERASI - BNI / 123 · 1.000')
  assert.notEqual(malformed.error, null)
  const valid = parseMakerDocument('Cisepat, 05-Oct-2026\n\nGAS : KOPERASI - BNI / 123 · 1.000')
  assert.equal(valid.error, null)
  assert.equal(valid.rows.length, 1)
  assert.equal(valid.rows[0].lineNumber, 3)
})


test('operational account mapping is resolved by recipient name and exact account identity', async () => {
  const { matchesMakerOperationalAccount } = await import('../src/features/maker-import/maker-import-utils.ts')
  const mapping = { ownerName: 'Yusgar Anggara Dinata', bank: 'MANDIRI', accountNumber: '1820018916205' }
  assert.equal(matchesMakerOperationalAccount('YUSGAR ANGGARA DINATA', 'Mandiri', '1820018916205', mapping), true)
  assert.equal(matchesMakerOperationalAccount('Nama Berbeda', 'MANDIRI', '1820018916205', mapping), false)
  assert.equal(matchesMakerOperationalAccount('Yusgar Anggara Dinata', 'BRI', '1820018916205', mapping), false)
  assert.equal(matchesMakerOperationalAccount('Yusgar Anggara Dinata', 'MANDIRI', '999999', mapping), false)
})
