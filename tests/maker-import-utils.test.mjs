import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMakerAmount,
  parseMakerDate,
  parseMakerDocument,
  matchesMakerOperationalAccount,
  matchesMakerAccountRecipient,
  findMappedNeutralAccountForLainLain
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
  assert.equal(parsed.rows[0].details, 'Beras dan Minyak')
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

test('Maker RAB product lists use natural conjunctions for two or more products', () => {
  const parsed = parseMakerDocument([
    'Cisepat, 05-Oct-2026',
    'RAB : CV TEST - BNI / 1111 · Ayam Potong, Buah · 241.000',
    'RAB : CV TEST - BNI / 1111 · Telur Asin, Telur Ayam, Telur Puyuh · 241.000',
    'RAB : CV TEST - BNI / 1111 · Telur Asin, Telur Ayam, dan Telur Puyuh · 241.000'
  ].join('\n'))

  assert.equal(parsed.error, null)
  assert.equal(parsed.rows[0].details, 'Ayam Potong dan Buah')
  assert.equal(parsed.rows[1].details, 'Telur Asin, Telur Ayam, dan Telur Puyuh')
  assert.equal(parsed.rows[2].details, 'Telur Asin, Telur Ayam, dan Telur Puyuh')
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


test('Lain-lain Allow rejects neutral accounts outside Koperasi Arutala BNI', () => {
  const parsed = parseMakerDocument([
    'Kertajadi, 19-Okt-2026',
    'LAIN-LAIN : Tali Rafia 30kg - Koperasi Arutala - BNI / 1985322260 · 720.000'
  ].join('\n'))

  assert.equal(parsed.error, null)
  const row = parsed.rows[0]
  assert.equal(row.kind, 'lain_lain')
  assert.equal(row.details, 'Tali Rafia 30kg')
  assert.equal(row.recipientName, 'Koperasi Arutala')
  assert.equal(row.bank, 'BNI')
  assert.equal(row.accountNumber, '1985322260')

  const mappedNeutralAccounts = [{
    id: 'neutral-arutala-account',
    name: 'KOPERASI ARUTALA',
    bank: 'BNI',
    accountNumber: '1985322260',
    aliases: ['Koperasi Arutala']
  }]
  assert.equal(
    findMappedNeutralAccountForLainLain(row, mappedNeutralAccounts)?.id,
    'neutral-arutala-account'
  )
  assert.equal(findMappedNeutralAccountForLainLain(row, []), null)

  // The helper has no kitchen-name exceptions; the caller supplies that kitchen's mappings.
  const otherKitchenRow = parseMakerDocument([
    'Cisepat, 19-Okt-2026',
    'LAIN-LAIN : Pembelian alat kecil - Koperasi Arutala - BNI / 1985322260 · 720.000'
  ].join('\n')).rows[0]
  assert.equal(
    findMappedNeutralAccountForLainLain(otherKitchenRow, mappedNeutralAccounts)?.id,
    'neutral-arutala-account'
  )
  assert.equal(findMappedNeutralAccountForLainLain(row, [{
    id: 'other-neutral-account', name: 'TOKO LAIN', bank: 'BNI',
    accountNumber: '1985322260', aliases: ['Koperasi Arutala']
  }]), null)
  assert.equal(findMappedNeutralAccountForLainLain(row, [{
    id: 'arutala-wrong-bank', name: 'KOPERASI ARUTALA', bank: 'BRI',
    accountNumber: '1985322260', aliases: ['Koperasi Arutala']
  }]), null)
})

test('Koperasi Arutala BNI Lain-lain mapping is detected across kitchen names', () => {
  const parsed = parseMakerDocument([
    'Kertajadi, 19-Okt-2026',
    'LAIN-LAIN : Tali Rafia 30kg - Koperasi Arutala - BNI / 1985322260 · 720.000'
  ].join('\n'))

  assert.equal(parsed.error, null)
  const row = parsed.rows[0]
  assert.equal(row.kind, 'lain_lain')
  assert.equal(row.details, 'Tali Rafia 30kg')
  assert.equal(row.recipientName, 'Koperasi Arutala')
  assert.equal(row.bank, 'BNI')
  assert.equal(row.accountNumber, '1985322260')

  const mappedNeutralAccounts = [{
    id: 'neutral-arutala-account',
    name: 'KOPERASI ARUTALA',
    bank: 'BNI',
    accountNumber: '1985322260',
    aliases: ['Koperasi Arutala']
  }]
  assert.equal(
    findMappedNeutralAccountForLainLain(row, mappedNeutralAccounts)?.id,
    'neutral-arutala-account'
  )
  assert.equal(findMappedNeutralAccountForLainLain(row, []), null)

  // Kitchen names do not affect matching; the caller supplies the selected kitchen's mappings.
  const otherKitchenRow = parseMakerDocument([
    'Cisepat, 19-Okt-2026',
    'LAIN-LAIN : Pembelian alat kecil - Koperasi Arutala - BNI / 1985322260 · 720.000'
  ].join('\n')).rows[0]
  assert.equal(
    findMappedNeutralAccountForLainLain(otherKitchenRow, mappedNeutralAccounts)?.id,
    'neutral-arutala-account'
  )
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


test('INSENTIF FASILITAS SPPG is routed through the existing sppg_rent mapping', () => {
  const parsed = parseMakerDocument([
    'Cikondang, 15-Okt-2026',
    'OPS HARIAN : Annisa Wulan Dari - BNI / 2044709294 · 6.363',
    'INSENTIF FASILITAS SPPG : Aryana - BNI / 1976811401 · 3.636',
    'GAJI RELAWAN : Annisa Wulan Dari - BNI / 2044709294 · 36',
    'INSENTIF PIC SEKOLAH : Annisa Wulan Dari - BNI / 2044709294 · 36',
    'INSENTIF PIC POSYANDU : Annisa Wulan Dari - BNI / 2044709294 · 36'
  ].join('\n'))

  assert.equal(parsed.error, null)
  assert.equal(parsed.kitchenName, 'Cikondang')
  assert.equal(parsed.rows.length, 5)

  const facility = parsed.rows[1]
  assert.equal(facility.kind, 'sppg_rent')
  assert.equal(facility.sourceCategory, 'Insentif Fasilitas SPPG')
  assert.equal(facility.manualFlow, 'operational_disbursement')
  assert.equal(facility.operationalType, 'sppg_rent')
  assert.equal(facility.recipientName, 'Aryana')
  assert.equal(facility.bank, 'BNI')
  assert.equal(facility.accountNumber, '1976811401')
  assert.equal(facility.amount, 3636)
  assert.equal(facility.manualDecision, 'pending')
})

test('Uppercase output categories and full bank account numbers remain importable', () => {
  const source = [
    'Cisepat, 16-Okt-2026',
    'RAB : CV Xyz Test - BNI / 0012342522 · Beras, Minyak · 241.000',
    'GAS : Koperasi Arutala - BNI / 1985322260 · 1.080.000',
    'GAS : Koperasi Arutala / Gas 12kg (25 tabung), Rapia - BNI / 1985322260 · 1.080.000',
    'OPS HARIAN : Petugas Test - BRI / 12345555 · 20.000',
    'SEWA SPPG : PIC Tes - BRI / 12343333 · 125.000',
    'INSENTIF FASILITAS SPPG : PIC Tes - BRI / 12343333 · 75.000',
    'GAJI RELAWAN : PIC Tes - BRI / 12343333 · 100.000',
    'SEWA KENDARAAN MOBIL (01-Oct-2026 - 31-Oct-2026) : Berkah Test - MANDIRI / 12344444 · 500.000',
    'LAIN-LAIN : Biaya Wifi - Provider Internet - BNI / 000123 · 25.000'
  ].join('\n')
  const parsed = parseMakerDocument(source)

  assert.equal(parsed.error, null)
  assert.deepEqual(
    parsed.rows.map((row) => row.kind),
    ['rab', 'gas', 'gas', 'ops_harian', 'sppg_rent', 'sppg_rent', 'relawan_salary', 'vehicle_rent', 'lain_lain']
  )
  assert.equal(parsed.rows[0].recipientName, 'CV Xyz Test')
  assert.equal(parsed.rows[0].accountNumber, '0012342522')
  assert.equal(parsed.rows[1].recipientName, 'Koperasi Arutala')
  assert.equal(parsed.rows[1].accountNumber, '1985322260')
  assert.equal(parsed.rows[2].details, 'Gas 12kg (25 tabung), Rapia')
  assert.equal(parsed.rows[3].accountNumber, '12345555')
  assert.equal(parsed.rows[4].sourceCategory, 'Insentif Fasilitas SPPG')
  assert.equal(parsed.rows[5].sourceCategory, 'Insentif Fasilitas SPPG')
  assert.equal(parsed.rows[5].accountNumber, '12343333')
  assert.equal(parsed.rows[7].accountNumber, '12344444')
  assert.equal(parsed.rows[8].accountNumber, '000123')
})



test('Maker business names with owner in parentheses match database mapping without extra verification', () => {
  const samples = [
    {
      source: 'CV Kramat (Ayi Suherlan)',
      accountName: 'CV Kramat',
      businessName: 'CV Kramat',
      ownerName: 'Ayi Suherlan'
    },
    {
      source: 'Koperasi Arutala (Cecep)',
      accountName: 'Koperasi Arutala',
      businessName: 'Koperasi Arutala',
      ownerName: 'Cecep'
    },
    {
      source: 'UD Maju Jaya (Yesa Andani)',
      accountName: 'UD Maju Jaya',
      businessName: 'UD Maju Jaya',
      ownerName: 'Yesa Andani'
    },
    {
      source: 'UMKM Purwanti (Erni Purwanti)',
      accountName: 'UMKM Purwanti',
      businessName: 'UMKM Purwanti',
      ownerName: 'Erni Purwanti'
    }
  ]

  for (const sample of samples) {
    assert.equal(
      matchesMakerAccountRecipient(sample.source, sample),
      true,
      sample.source + ' should match business + owner mapping'
    )
    assert.equal(
      matchesMakerAccountRecipient(sample.source.toLocaleUpperCase('id-ID'), sample),
      true,
      'Matching should be case-insensitive for ' + sample.source
    )
  }
})

test('Maker account-recipient matching stays strict when business or owner differs', () => {
  const mapping = {
    accountName: 'CV Kramat',
    businessName: 'CV Kramat',
    ownerName: 'Ayi Suherlan'
  }

  assert.equal(matchesMakerAccountRecipient('CV Kramat (Owner Lain)', mapping), false)
  assert.equal(matchesMakerAccountRecipient('CV Lain (Ayi Suherlan)', mapping), false)
  assert.equal(matchesMakerAccountRecipient('CV Kramat', mapping), true)
  assert.equal(matchesMakerAccountRecipient('Ayi Suherlan', mapping), true)
})

test('Maker OPS HARIAN supports custom recipient plus optional note', () => {
  const parsed = parseMakerDocument([
    'Cisepat, 23-Okt-2026',
    'OPS HARIAN : Petugas Cadangan - BCA / 1234567890 · Pembayaran BBM genset · 320.000',
    'OPS HARIAN : Petugas Mapping - BRI / 407701032673505 · Ops Harian · 1.000.000'
  ].join('\n'))

  assert.equal(parsed.error, null)
  assert.equal(parsed.rows.length, 2)

  const custom = parsed.rows[0]
  assert.equal(custom.kind, 'ops_harian')
  assert.equal(custom.manualFlow, 'ops_disbursement')
  assert.equal(custom.recipientName, 'Petugas Cadangan')
  assert.equal(custom.bank, 'BCA')
  assert.equal(custom.accountNumber, '1234567890')
  assert.equal(custom.details, 'Pembayaran BBM genset')
  assert.equal(custom.amount, 320000)

  const mapped = parsed.rows[1]
  assert.equal(mapped.kind, 'ops_harian')
  assert.equal(mapped.manualFlow, 'ops_disbursement')
  assert.equal(mapped.recipientName, 'Petugas Mapping')
  assert.equal(mapped.details, 'Ops Harian')
  assert.equal(mapped.amount, 1000000)
})

test('Koperasi Arutala payout card parses both GAS cylinder sizes and custom non-GAS payments', () => {
  const parsed = parseMakerDocument([
    'Cipetir, 23-Okt-2026',
    'GAS : Koperasi Arutala / Gas 12kg (4 tabung) - BNI / 1985322260 · 1.080.000',
    'GAS : Koperasi Arutala / Gas 50kg (2 tabung) - BNI / 1985322260 · 540.000',
    'OPS HARIAN : Koperasi Arutala - BNI / 1985322260 · Pembayaran plastik (HDPE) · 500.000'
  ].join('\n'))

  assert.equal(parsed.error, null)
  assert.equal(parsed.rows.length, 3)

  const gas12 = parsed.rows[0]
  assert.equal(gas12.kind, 'gas')
  assert.equal(gas12.recipientName, 'Koperasi Arutala')
  assert.equal(gas12.bank, 'BNI')
  assert.equal(gas12.accountNumber, '1985322260')
  assert.equal(gas12.details, 'Gas 12kg (4 tabung)')
  assert.equal(gas12.amount, 1080000)

  const gas50 = parsed.rows[1]
  assert.equal(gas50.kind, 'gas')
  assert.equal(gas50.details, 'Gas 50kg (2 tabung)')
  assert.equal(gas50.amount, 540000)

  const custom = parsed.rows[2]
  assert.equal(custom.kind, 'ops_harian')
  assert.equal(custom.manualFlow, 'ops_disbursement')
  assert.equal(custom.recipientName, 'Koperasi Arutala')
  assert.equal(custom.bank, 'BNI')
  assert.equal(custom.accountNumber, '1985322260')
  assert.equal(custom.details, 'Pembayaran plastik (HDPE)')
  assert.equal(custom.amount, 500000)
})
