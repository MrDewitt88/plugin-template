import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'

export const IdentitySchema = z.object({ tenantId: z.string().uuid(), userId: z.string().uuid() }).strict()
export type Identity = z.infer<typeof IdentitySchema>
export const CreateItemSchema = z.object({ text: z.string().trim().min(1).max(500) }).strict()
const ItemSchema = z.object({ id: z.string().uuid(), text: z.string().min(1).max(500), createdAt: z.string().datetime() }).strict()
export type Item = z.infer<typeof ItemSchema>
const StateSchema = z.object({ schemaVersion: z.literal(1), collections: z.record(z.array(ItemSchema).max(200)) }).strict()

/** One app process owns this file; all surfaces use this same domain service. */
export class ItemStore {
  private state: z.infer<typeof StateSchema> = { schemaVersion: 1, collections: {} }
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly path: string) {}
  async load(): Promise<void> {
    try { this.state = StateSchema.parse(JSON.parse(await readFile(this.path, 'utf8'))) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  private key(identity: Identity): string {
    const value = IdentitySchema.parse(identity)
    return value.tenantId + '/' + value.userId
  }
  async list(identity: Identity): Promise<Item[]> {
    await this.queue
    return (this.state.collections[this.key(identity)] ?? []).map(item => ({ ...item }))
  }
  create(identity: Identity, input: unknown): Promise<Item> {
    const key = this.key(identity), { text } = CreateItemSchema.parse(input)
    const operation = this.queue.then(async () => {
      const items = this.state.collections[key] ?? []
      if (items.length >= 200) throw new Error('item_limit_reached')
      const item: Item = { id: randomUUID(), text, createdAt: new Date().toISOString() }
      const next = { ...this.state, collections: { ...this.state.collections, [key]: [...items, item] } }
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      const temporary = this.path + '.tmp'
      const file = await open(temporary, 'w', 0o600)
      try { await file.writeFile(JSON.stringify(next) + '\n'); await file.sync() }
      finally { await file.close() }
      await rename(temporary, this.path)
      this.state = next
      return { ...item }
    })
    this.queue = operation.catch(() => {})
    return operation
  }
}
