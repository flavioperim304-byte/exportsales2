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
  monitorQuery,
  signalsFromMonitorOutput,
  topLeadsByCountry,
  verifyExaSignature,
  webhookPublicUrl,
} from "../lib/monitors"
import { createRun } from "../lib/pipeline"
import type { Lead, Run } from "../lib/types"

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

test("top three per country prefer response score and skip the sample", () => {
  const chile = [
    lead({
      id: "c1",
      name: "Alfa Hair",
      country: "Chile",
      response: { level: "medium", score: 40, note: "", layers: [], hiring: false, mixChange: false, socialGrowth: false, computedAt: "" },
    }),
    lead({
      id: "c2",
      name: "Beta Hair",
      country: "Chile",
      response: { level: "high", score: 70, note: "", layers: [], hiring: false, mixChange: false, socialGrowth: false, computedAt: "" },
    }),
    lead({
      id: "c3",
      name: "Gama Hair",
      country: "Chile",
      response: { level: "medium", score: 50, note: "", layers: [], hiring: false, mixChange: false, socialGrowth: false, computedAt: "" },
    }),
    lead({
      id: "c4",
      name: "Delta Hair",
      country: "Chile",
      response: { level: "low", score: 20, note: "", layers: [], hiring: false, mixChange: false, socialGrowth: false, computedAt: "" },
    }),
  ]
  const kenya = [
    lead({
      id: "k1",
      name: "Nairobi Hair",
      country: "Kenya",
      response: { level: "medium", score: 44, note: "", layers: [], hiring: false, mixChange: false, socialGrowth: false, computedAt: "" },
    }),
  ]
  const sample = liveRun("sample-ish", chile)
  sample.mode = "sample"
  const watched = topLeadsByCountry([sample, liveRun("chile", chile), liveRun("kenya", kenya)])
  assert.deepEqual(
    watched.filter((row) => row.country === "Chile").map((row) => row.name),
    ["Beta Hair", "Gama Hair", "Alfa Hair"]
  )
  assert.equal(watched.filter((row) => row.country === "Kenya").length, 1)
  assert.equal(watched.find((row) => row.name === "Beta Hair")?.rank, 1)
})

test("the monitor query names the company and the six signal types", () => {
  const query = monitorQuery("Premium Cosmetics", "Panama")
  assert.match(query, /Premium Cosmetics/)
  assert.match(query, /Panama/)
  for (const token of ["news", "product launch", "promotion", "exhibition", "event", "mention"]) {
    assert.match(query, new RegExp(token.replace(" ", "\\s")))
  }
  assert.equal(MONITOR_PERIOD, "7d")
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
  assert.equal(body.trigger.period, "7d")
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
