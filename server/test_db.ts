import { db } from './src/db/client'
import { patients } from './src/db/schema'

async function run() {
  try {
    const res = await db.select().from(patients).limit(1)
    console.log("Success:", res)
  } catch (e) {
    console.error("Error:", e)
  }
  process.exit(0)
}

run()
