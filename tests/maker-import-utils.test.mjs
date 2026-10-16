import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMakerAmount,
  parseMakerDate,
  parseMakerDocument,
  matchesMakerOperationalAccount
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
  assert.equal(parseMakerDate('05-Okt-2026'), '2026-10-05')
  assert.equal(parseMakerDate('05-Mei-2026'), '2026-05-05')
  assert.equal(parseMakerDate('05-Agu-2026'), '2026-08-05')
  assert.equal(parseMakerDate('05-Des-2026'), '2026-12-05')
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
  assert.equal(parsed.rows[1].details, 'Gas')
  assert.equal(parsed.rows[2].kind, 'sppg_rent')
  assert.equal(parsed.rows[2].recipientName, 'PIC Tes')
  assert.equal(parsed.rows[3].kind, 'combined_payroll')
  assert.equal(parsed.rows[3].amount, 1000000)
  assert.equal(parsed.rows[4].kind, 'vehicle_rent')
  assert.match(parsed.rows[4].details, /Jenis kendaraan: Mobil/)
  assert.match(parsed.rows[4].details, /Periode sewa: 01-Oct-2026 - 31-Oct-2026/)
  assert.equal(parsed.rows[5].kind, 'ops_harian')
  assert.equal(parsed.rows[5].manualFlow, 'ops_disbursement')
  assert.equal(parsed.rows[5].details, 'Ops Harian')
  assert.equal(parsed.rows[5].recipientName, 'Petugas Test')
  assert.equal(parsed.rows[6].kind, 'lain_lain')
  assert.equal(parsed.rows[6].details, 'Biaya Ops Harian')
  assert.equal(parsed.rows[6].recipientName, 'Penerima Test')
  assert.equal(parsed.rows[6].accountNumber, '000123')
  assert.equal(parsed.rows[6].manualDecision, 'pending')
  assert.equal(parsed.rows[6].manualFlow, 'ops_disbursement')
})

test('Lain-lain rows start pending until Admin chooses Allow or Block', () => {
  const parsed = parseMakerDocument([
    'Campakamulya, 14-Okt-2026',
    'Lain-lain : Biaya Wifi - Provider Internet - BNI / 000123 · 25.000'
  ].join('\n'))

  assert.equal(parsed.error, null)
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].kind, 'lain_lain')
  assert.equal(parsed.rows[0].manualDecision, 'pending')
  assert.equal(parsed.rows[0].recipientName, 'Provider Internet')
  assert.equal(parsed.rows[0].accountNumber, '000123')
})

test('Maker parser reads italic OPS Real as a nominal-only per-kitchen realization row', () => {
  const parsed = parseMakerDocument([
    'Cimanggu, 15-Okt-2026',
    'RAB : CV TEST - BNI / 1111 · Beras · 125.000',
    '',
    '_OPS Real_ · 1.200.000'
  ].join('\n'))

  assert.equal(parsed.error, null)
  assert.equal(parsed.kitchenName, 'Cimanggu')
  assert.equal(parsed.transactionDate, '2026-10-15')
  assert.equal(parsed.rows.length, 2)
  const realization = parsed.rows[1]
  assert.equal(realization.kind, 'real_ops')
  assert.equal(realization.sourceCategory, 'OPS Real')
  assert.equal(realization.manualFlow, 'real_ops')
  assert.equal(realization.amount, 1200000)
  assert.equal(realization.recipientName, '')
  assert.equal(realization.bank, '')
  assert.equal(realization.accountNumber, '')
  assert.equal(realization.accountId, '')
  assert.equal(realization.operationalRuleId, '')
  assert.equal(realization.lineNumber, 4)
})

test('Maker parser rejects invalid headers and preserves physical source line numbers', () => {
  const malformed = parseMakerDocument('Campakamulya, 05-Otx-2026\nGAS : KOPERASI - BNI / 123 · 1.000')
  assert.notEqual(malformed.error, null)
  const valid = parseMakerDocument('Cisepat, 05-Okt-2026\n\nGAS : KOPERASI - BNI / 123 · 1.000')
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


test('Maker parser recognizes combined Cimanggu PIC incentives as one operational disbursement', () => {
  const parsed = parseMakerDocument([
    'Cimanggu, 15-Okt-2026',
    'Insentif PIC Sekolah, Insentif PIC Posyandu : Dikri Ramdan Firdaus - BNI / 1987495640 · 750.000'
  ].join('\n'))

  assert.equal(parsed.error, null)
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].kind, 'combined_pic_incentive')
  assert.equal(parsed.rows[0].sourceCategory, 'Insentif PIC Sekolah, Insentif PIC Posyandu')
  assert.equal(parsed.rows[0].recipientName, 'Dikri Ramdan Firdaus')
  assert.equal(parsed.rows[0].bank, 'BNI')
  assert.equal(parsed.rows[0].accountNumber, '1987495640')
  assert.equal(parsed.rows[0].amount, 750000)
  assert.equal(parsed.rows[0].manualFlow, 'operational_disbursement')
  assert.equal(parsed.rows[0].operationalType, 'pic_incentive')
})


test('Maker GAS item type and cylinder quantity stay in transaction notes', () => {
  const source = [
    'Cisepat, 16-Okt-2026',
    'GAS : Koperasi Arutala / Gas 12kg (3 tabung) - BNI / 1985322260 · 75.000'
  ].join('\n')
  const parsed = parseMakerDocument(source)

  assert.equal(parsed.error, null)
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].kind, 'gas')
  assert.equal(parsed.rows[0].recipientName, 'Koperasi Arutala')
  assert.equal(parsed.rows[0].bank, 'BNI')
  assert.equal(parsed.rows[0].accountNumber, '1985322260')
  assert.equal(parsed.rows[0].details, 'Gas 12kg (3 tabung)')
  assert.equal(parsed.rows[0].amount, 75000)
})


test('Uppercase output categories and masked bank suffixes remain importable', () => {
  const source = [
    'Cisepat, 16-Okt-2026',
    'RAB : CV Xyz Test - BNI / xxx 2522 · Beras, Minyak · 241.000',
    'GAS : Koperasi Arutala - BNI / xxx 2260 · 1.080.000',
    'GAS : Koperasi Arutala / Gas 12kg (25 tabung), Rapia - BNI / xxx 2260 · 1.080.000',
    'OPS HARIAN : Petugas Test - BRI / xxx 5555 · 20.000',
    'SEWA SPPG : PIC Tes - BRI / xxx 3333 · 125.000',
    'GAJI RELAWAN : PIC Tes - BRI / xxx 3333 · 100.000',
    'SEWA KENDARAAN MOBIL (01-Oct-2026 - 31-Oct-2026) : Berkah Test - MANDIRI / xxx 4444 · 500.000',
    'LAIN-LAIN : Biaya Wifi - Provider Internet - BNI / xxx 0123 · 25.000'
  ].join('\\n')
  const parsed = parseMakerDocument(source)

  assert.equal(parsed.error, null)
  assert.deepEqual(
    parsed.rows.map((row) => row.kind),
    ['rab', 'gas', 'gas', 'ops_harian', 'sppg_rent', 'relawan_salary', 'vehicle_rent', 'lain_lain']
  )
  assert.equal(parsed.rows[0].recipientName, 'CV Xyz Test')
  assert.equal(parsed.rows[0].accountNumber, 'xxx2522')
  assert.equal(parsed.rows[1].recipientName, 'Koperasi Arutala')
  assert.equal(parsed.rows[1].accountNumber, 'xxx2260')
  assert.equal(parsed.rows[2].details, 'Gas 12kg (25 tabung), Rapia')
  assert.equal(parsed.rows[3].accountNumber, 'xxx5555')
  assert.equal(parsed.rows[7].accountNumber, 'xxx0123')
})

test('Masked account suffix matches the actual operational account', () => {
  const mapping = { ownerName: 'PIC Tes', bank: 'BNI', accountNumber: '0012342522' }
  assert.equal(matchesMakerOperationalAccount('PIC Tes', 'BNI', 'xxx 2522', mapping), true)
  assert.equal(matchesMakerOperationalAccount('PIC Tes', 'BNI', 'xxx 2523', mapping), false)
  assert.equal(matchesMakerOperationalAccount('PIC Lain', 'BNI', 'xxx 2522', mapping), false)
})
