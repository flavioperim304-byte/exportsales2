import assert from "node:assert/strict"
import test from "node:test"
import * as XLSX from "xlsx"
import { parseTradeExcel } from "../lib/trade-excel"
import { countryFromFilename, parseTradeInput } from "../lib/trade-records"

function xlsxFromAoa(rows: (string | number)[][], sheet = "Sheet1"): Buffer {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheet)
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
}

test("filename stems fill country when the ficha omitted it", () => {
  assert.equal(countryFromFilename("austsham.txt"), "Australia")
  assert.equal(countryFromFilename("jap.xlsx"), "Japan")
  assert.equal(countryFromFilename("hk.csv"), "Hong Kong")
  assert.equal(countryFromFilename("uz.txt"), "Uzbekistan")
  assert.equal(countryFromFilename("ger.xls"), "Germany")
  assert.equal(countryFromFilename("UAE.txt"), "United Arab Emirates")
  assert.equal(countryFromFilename("madag.txt"), "Madagascar")
  assert.equal(countryFromFilename("zam.txt"), "Zambia")
  assert.equal(countryFromFilename("uga.txt"), "Uganda")
  assert.equal(countryFromFilename("lyb.txt"), "Libya")
  assert.equal(countryFromFilename("botsw.txt"), "Botswana")
  assert.equal(countryFromFilename("maur.txt"), "Mauritius")
  assert.equal(countryFromFilename("kenya.txt"), "Kenya")
  assert.equal(countryFromFilename("ken.txt"), "Kenya")
  assert.equal(countryFromFilename("al-2.txt"), "Algeria")
  assert.equal(countryFromFilename("safrica.txt"), "South Africa")
  assert.equal(countryFromFilename("sene.txt"), "Senegal")
  assert.equal(countryFromFilename("sudan.txt"), "Sudan")
  assert.equal(countryFromFilename("Italy.txt"), "Italy")
  assert.equal(countryFromFilename("Uru.txt"), "Uruguay")
  assert.equal(countryFromFilename("tradeindata-product.txt"), "")
})

test("Excel with TradeInData headers becomes filings and stamps Japan from jap.xlsx", () => {
  const buffer = xlsxFromAoa([
    ["Company Name", "HSCODE", "Total Shipment", "Last Trade Date", "Description"],
    ["OSAKA HAIR TRADING KK", "330510", 44, "2026-08-12", "shampoo keratin"],
  ])
  const rows = parseTradeExcel(buffer, "jap.xlsx")
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.importer, "OSAKA HAIR TRADING KK")
  assert.equal(rows[0]?.country, "Japan")
  assert.equal(rows[0]?.hs, "330510")
  assert.equal(rows[0]?.hsShipments, 44)
})

test("Excel that holds a pasted Product Data card still parses", () => {
  const buffer = xlsxFromAoa([
    ["GLB LABORATORIOS BOLIVIA S.A. High-Transaction Enterprise"],
    ["Bolivia Importer"],
    ["LAST TRADE DATE: 2026-08-29"],
    ["DESCRIPTION | 330590"],
    ["preparaciones capilares henna glb 41 5ml 12"],
    ["TOTAL SHIPMENT 330590"],
    ["139"],
    ["TOTAL SHIPMENT"],
    ["1386"],
  ])
  const rows = parseTradeExcel(buffer, "bolivia.xlsx")
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.importer, "GLB LABORATORIOS BOLIVIA S.A.")
  assert.equal(rows[0]?.country, "Bolivia")
  assert.equal(rows[0]?.hs, "330590")
  assert.equal(rows[0]?.hsShipments, 139)
})

test("a txt dump named austsham keeps parsed country and fills Unknown from the file", () => {
  const named = parseTradeInput(
    "LOCAL DIST PTY\nAustralia Importer\nLAST TRADE DATE: 2026-07-01\nDESCRIPTION | 330510\nshampoo\nTOTAL SHIPMENT 330510\n12\n",
    undefined,
    "austsham.txt"
  )
  assert.equal(named[0]?.country, "Australia")
  const filled = parseTradeInput(
    "Importer,HSCODE,Total Shipment\nNO COUNTRY PTY,330510,9\n",
    undefined,
    "austsham.txt"
  )
  assert.equal(filled[0]?.country, "Australia")
  assert.equal(filled[0]?.importer, "NO COUNTRY PTY")
})
