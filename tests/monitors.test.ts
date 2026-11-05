import assert from "node:assert/strict"
import crypto from "node:crypto"
import test from "node:test"
import { classifyActivity } from "../lib/activity"
import { KANECHOM_BRIEF } from "../lib/example"
import {
  MONITOR_PERIOD,
  MONITOR_SIGNALS,
  applyMonitorToRun,
  monitorCreateBody,
  monitorMarketAllowed,
  monitorQuery,
  signalsFromMonitorOutput,
  skippedMonitorCountries,
  verifyExaSignature,
  watchLeadsForMonitors,
  webhookPublicUrl,
} from "../lib/monitors"
import { createRun } from "../lib/pipeline"
import type { Band, Lead, LeadScore, Run } from "../lib/types"

function lead(partial: Partial<Lead> & Pick<Lead, "id" | "name" | "country">): Lead {
  return {
    domain: `${partial.id}.example`,
    url: `https://${partial.id}.example`,
    market: partial.country,
    exa: {
      title: partial.name,
      url: `https://${partial.id}.example`,
      domain: `${partial.id}.example`,
      text: "",
      highlights: [],
      summary: "",
    },
    ...partial,
  }
}

function liveRun(id: string, leads: Lead[]): Run {
  const run = createRun(KANECHOM_BRIEF)
  run.id = id
  run.mode = "live"
  run.leads = leads
  return run
}

function score(band: Band, total = 82): LeadScore {
  return { total, band, headline: "", nextAction: "", disqualified: false, dimensions: [] }
}

function scored(
  partial: Partial<Lead> & Pick<Lead, "id" | "name" | "country">,
  band: Band,
  response: number
): Lead {
  return lead({
    ...partial,
    score: score(band, band === "best_fit" ? 82 : band === "strong" ? 70 : 48),
    response: {
      level: response >= 62 ? "high" : response >= 40 ? "medium" : "low",
      score: response,
      note: "",
      layers: [],
      hiring: false,
      mixChange: false,
      socialGrowth: false,
      computedAt: "",
    },
  })
}

test("monitors only take best fits in relevant countries and skip sample runs", () => {
  const chile = [
    scored({ id: "c1", name: "Alfa Hair", country: "Chile" }, "best_fit", 40),
    scored({ id: "c2", name: "Beta Hair", country: "Chile" }, "best_fit", 70),
    scored({ id: "c3", name: "Gama Hair", country: "Chile" }, "strong", 80),
    scored({ id: "c4", name: "Delta Hair", country: "Chile" }, "possible", 20),
  ]
  const kenya = [scored({ id: "k1", name: "Nairobi Hair", country: "Kenya" }, "best_fit", 90)]
  const uganda = [scored({ id: "u1", name: "Kampala Hair", country: "Uganda" }, "best_fit", 88)]
  const southAfrica = [scored({ id: "za1", name: "Joburg Hair", country: "South Africa" }, "best_fit", 86)]
  const uk = [scored({ id: "uk1", name: "London Hair", country: "United Kingdom" }, "best_fit", 84)]
  const bolivia = [scored({ id: "b1", name: "La Paz Hair", country: "Bolivia" }, "best_fit", 85)]
  const costa = [scored({ id: "cr1", name: "Tico Hair", country: "Costa Rica" }, "best_fit", 75)]
  const portugal = [scored({ id: "pt1", name: "Lisboa Hair", country: "Portugal" }, "best_fit", 80)]
  const pakistan = [scored({ id: "pk1", name: "Karachi Hair", country: "Pakistan" }, "best_fit", 82)]
  const spain = [scored({ id: "es1", name: "Madrid Hair", country: "Spain" }, "strong", 77)]
  const sample = liveRun("sample-ish", chile)
  sample.mode = "sample"
  const runs = [
    sample,
    liveRun("chile", chile),
    liveRun("kenya", kenya),
    liveRun("uganda", uganda),
    liveRun("south-africa", southAfrica),
    liveRun("uk", uk),
    liveRun("bolivia", bolivia),
    liveRun("costa", costa),
    liveRun("portugal", portugal),
    liveRun("pakistan", pakistan),
    liveRun("spain", spain),
  ]
  const watched = watchLeadsForMonitors(runs)
  assert.deepEqual(
    watched.map((row) => row.name),
    ["Beta Hair", "Alfa Hair"]
  )
  assert.equal(watched.find((row) => row.name === "Beta Hair")?.rank, 1)
  assert.equal(watched.some((row) => row.name === "Gama Hair"), false)
  assert.equal(monitorMarketAllowed("Republica Domincana"), true)
  assert.equal(monitorMarketAllowed("Uganda"), false)
  assert.equal(monitorMarketAllowed("South Africa"), false)
  assert.equal(monitorMarketAllowed("África do Sul"), false)
  assert.equal(monitorMarketAllowed("United Kingdom"), false)
  assert.equal(monitorMarketAllowed("UK"), false)
  assert.equal(monitorMarketAllowed("India"), false)
  assert.equal(monitorMarketAllowed("Bolivia"), false)
  assert.equal(monitorMarketAllowed("Costa Rica"), false)
  assert.equal(monitorMarketAllowed("Portugal"), false)
  assert.equal(monitorMarketAllowed("Pakistan"), false)
  const skipped = skippedMonitorCountries(runs)
  assert.deepEqual(
    skipped.map((row) => `${row.country}:${row.reason}`),
    [
      "Bolivia:market",
      "Costa Rica:market",
      "Kenya:market",
      "Pakistan:market",
      "Portugal:market",
      "South Africa:market",
      "Spain:band",
      "Uganda:market",
      "United Kingdom:market",
    ]
  )
})

test("the monitor query names the company and the six signal types", () => {
  const query = monitorQuery("Premium Cosmetics", "Panama")
  assert.match(query, /Premium Cosmetics/)
  assert.match(query, /Panama/)
  for (const token of ["news", "product launch", "promotion", "exhibition", "event", "mention"]) {
    assert.match(query, new RegExp(token.replace(" ", "\\s")))
  }
  assert.equal(MONITOR_PERIOD, "15d")
  assert.deepEqual([...MONITOR_SIGNALS], [
    "news",
    "product launches",
    "promotion",
    "exhibitions",
    "events",
    "mentions",
  ])
  const body = monitorCreateBody(
    {
      runId: "r1",
      leadId: "c2",
      name: "Premium Cosmetics",
      domain: "premium.example",
      url: "https://premium.example",
      country: "Panama",
      rank: 1,
      responseScore: 70,
      fitIndex: 40,
    },
    "https://exportsales.onrender.com/api/exa/webhook"
  )
  assert.equal(body.trigger.period, "15d")
  assert.equal(body.trigger.type, "interval")
  assert.deepEqual(body.webhook.events, ["monitor.run.completed"])
  assert.equal(body.metadata.leadId, "c2")
})

test("webhook HMAC follows Exa's t.payload scheme", () => {
  const payload = `{"type":"monitor.run.completed"}`
  const secret = "whsec_test"
  const timestamp = "1710000000"
  const digest = crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(payload).digest("hex")
  assert.equal(verifyExaSignature(payload, `t=${timestamp},v1=${digest}`, secret), true)
  assert.equal(verifyExaSignature(payload, `t=${timestamp},v1=${"ab".repeat(32)}`, secret), false)
})

test("monitor output drops URLs that are not in results and never invents a purchase", () => {
  const item = lead({ id: "prem", name: "Premium Cosmetics", country: "Panama", url: "https://premium.example", domain: "premium.example" })
  const signals = signalsFromMonitorOutput(item, {
    results: [
      {
        title: "Premium Cosmetics at Cosmoprof",
        url: "https://news.example/premium-cosmoprof",
        text: "The distributor is an exhibitor at Cosmoprof.",
      },
    ],
    content: {
      signals: [
        {
          kind: "exhibition",
          title: "Premium Cosmetics at Cosmoprof",
          url: "https://news.example/premium-cosmoprof",
          quote: "Exhibitor list.",
        },
        {
          kind: "launch",
          title: "Invented last purchase of Kanechom",
          url: "https://invented.example/kanechom-order",
          quote: "Bought Kanechom last week.",
        },
      ],
    },
  })
  assert.equal(signals.some((row) => row.kind === "exhibition"), true)
  assert.equal(
    signals.some((row) => /kanechom/i.test(row.title) || /invented/i.test(row.url)),
    false
  )
})

test("a Cosmoprof page is an exhibition, a campaign is a promotion", () => {
  assert.equal(
    classifyActivity("https://news.example/fair", "Premium at Cosmoprof Bologna", "Exhibitor stand no. 12"),
    "exhibition"
  )
  assert.equal(
    classifyActivity("https://premium.example/promo", "Campanha de verão", "Nova promoção de keratin."),
    "promotion"
  )
})

test("applying a monitor run stamps activity on the lead", () => {
  const item = lead({ id: "prem", name: "Premium Cosmetics", country: "Panama" })
  const run = liveRun("run-monitor", [item])
  const added = applyMonitorToRun(run, "prem", {
    results: [
      {
        title: "Premium Cosmetics mentioned in Panama retail news",
        url: "https://news.example/premium-mention",
        text: "The distributor was mentioned in a retail roundup.",
      },
    ],
  })
  assert.equal(added, 1)
  assert.equal(run.leads[0].activity?.signals.length, 1)
  assert.ok(run.leads[0].signalsAt)
  assert.ok(run.leads[0].response)
})

test("the public webhook URL is the Render HTTPS path", () => {
  assert.match(webhookPublicUrl(), /^https:\/\/exportsales\.onrender\.com\/api\/exa\/webhook$/)
})
