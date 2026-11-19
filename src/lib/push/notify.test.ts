import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/service", () => ({
  getServerDb: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: "Sam" } }) }) }) }),
  }),
}))

const { notifyJoined, notifyListAdded, timeBucket } = await import("./notify")
const { FakeSender, FakeStore } = await import("./fakes")

let sender: InstanceType<typeof FakeSender>
let store: InstanceType<typeof FakeStore>
const memberIds = async () => ["sam", "alex", "blair"]
const t0 = Date.UTC(2026, 10, 20, 17, 0, 0)

beforeEach(() => {
  sender = new FakeSender()
  store = new FakeStore()
  for (const id of ["sam", "alex", "blair"]) store.addDevice(id, `tok-${id}`)
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("notifyListAdded", () => {
  it("tells housemates, not the person who added", async () => {
    await notifyListAdded("h1", "sam", "Milk", { sender, store, memberIds, now: () => t0 })
    expect(sender.sent.map((s) => s.token).sort()).toEqual(["tok-alex", "tok-blair"])
    expect(sender.sent[0].message).toMatchObject({ body: "Sam added Milk", url: "/list", kind: "list" })
  })

  it("ten adds in five minutes is one push", async () => {
    for (let i = 0; i < 10; i++) {
      await notifyListAdded("h1", "sam", `Item ${i}`, { sender, store, memberIds, now: () => t0 + i * 20_000 })
    }
    expect(sender.sent).toHaveLength(2)
    expect(sender.sent[0].message.body).toBe("Sam added Item 0")
  })

  it("buzzes again in the next five-minute slot", async () => {
    await notifyListAdded("h1", "sam", "Milk", { sender, store, memberIds, now: () => t0 })
    await notifyListAdded("h1", "sam", "Eggs", { sender, store, memberIds, now: () => t0 + 5 * 60_000 })
    expect(sender.sent).toHaveLength(4)
  })

  it("respects the list switch", async () => {
    store.switchOff("alex", "list")
    await notifyListAdded("h1", "sam", "Milk", { sender, store, memberIds, now: () => t0 })
    expect(sender.sent.map((s) => s.token)).toEqual(["tok-blair"])
  })

  it("never throws when loading members fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(
      notifyListAdded("h1", "sam", "Milk", {
        sender,
        store,
        memberIds: async () => {
          throw new Error("db down")
        },
      }),
    ).resolves.toBe(true)
  })
})

describe("deferred delivery", () => {
  it("claims now, delivers in the deferred task, and says the slot was claimed", async () => {
    const tasks: (() => Promise<void>)[] = []
    const defer = (task: () => Promise<void>) => void tasks.push(task)
    expect(await notifyListAdded("h1", "sam", "Milk", { sender, store, memberIds, now: () => t0, defer })).toBe(true)
    expect(sender.sent).toHaveLength(0)
    await tasks[0]()
    expect(sender.sent).toHaveLength(2)
    expect(await notifyListAdded("h1", "sam", "Eggs", { sender, store, memberIds, now: () => t0, defer })).toBe(false)
    expect(tasks).toHaveLength(1)
  })

  it("a failing deferred task doesn't throw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const tasks: (() => Promise<void>)[] = []
    const failing = async () => {
      throw new Error("db down")
    }
    await notifyJoined("h1", "sam", { sender, store, memberIds: failing, now: () => t0, defer: (t) => void tasks.push(t) })
    await expect(tasks[0]()).resolves.toBeUndefined()
  })

  it("is false when push isn't configured", async () => {
    expect(await notifyJoined("h1", "sam", { sender, store: null })).toBe(false)
  })
})

describe("notifyJoined", () => {
  it("tells the people already there, not the joiner", async () => {
    await notifyJoined("h1", "sam", { sender, store, memberIds, now: () => t0 })
    expect(sender.sent.map((s) => s.token).sort()).toEqual(["tok-alex", "tok-blair"])
    expect(sender.sent[0].message).toMatchObject({ body: "Sam joined your household", url: "/household", kind: "joined" })
  })

  it("respects the joined switch", async () => {
    store.switchOff("blair", "joined")
    await notifyJoined("h1", "sam", { sender, store, memberIds, now: () => t0 })
    expect(sender.sent.map((s) => s.token)).toEqual(["tok-alex"])
  })
})

describe("timeBucket", () => {
  it("is constant within five minutes", () => {
    expect(timeBucket(t0)).toBe(timeBucket(t0 + 4 * 60_000 + 59_000))
    expect(timeBucket(t0)).not.toBe(timeBucket(t0 + 5 * 60_000))
  })
})
