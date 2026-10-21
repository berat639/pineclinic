import assert from 'node:assert/strict'
import {sql} from 'drizzle-orm'
import {db,closeDb} from '../../db/client'
import {ensureIntegrations} from './store'
import {recordCallConnected} from './routing'
if(!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL || '').hostname)) throw Error('Local database required')
const clinic=crypto.randomUUID(), other=crypto.randomUUID()
await ensureIntegrations()
try {
 await db.execute(sql`INSERT INTO clinics(id,name) VALUES(${clinic},'Test automation fixture'),(${other},'Isolation fixture')`)
 await db.execute(sql`INSERT INTO managed_integrations(clinic_id,service,draft) VALUES(${clinic},'phone','{}'),(${other},'phone','{}')`)
 const add=async(kind:string,revision=1,expired=false,id=clinic)=>{
  const testId=crypto.randomUUID()
  await db.execute(sql`INSERT INTO integration_tests(id,clinic_id,service,revision,operation_id,kind,target,status,evidence,expires_at) VALUES(${testId},${id},'phone',${revision},${crypto.randomUUID()},${kind},'+905000000001','accepted','{"channel":"test-channel"}',now()+${expired?'-1 minute':'15 minutes'}::interval)`)
  return testId
 }
 const inbound=await add('inbound'),expired=await add('inbound',1,true),stale=await add('inbound',2),isolated=await add('inbound',1,false,other),transfer=await add('transfer')
 const status=async(id:string)=>{const [r]=await db.execute(sql`SELECT status FROM integration_tests WHERE id=${id}`);return r.status}
 await recordCallConnected('wrong-channel',clinic);assert.equal(await status(inbound),'accepted')
 await recordCallConnected('test-channel',clinic)
 assert.equal(await status(inbound),'confirmed');assert.equal(await status(transfer),'accepted')
 for(const id of [expired,stale,isolated])assert.equal(await status(id),'accepted')
 await recordCallConnected('test-channel',clinic,true);assert.equal(await status(transfer),'confirmed')
 await recordCallConnected('test-channel',clinic);assert.equal(await status(inbound),'confirmed')
 console.log('PASS: automatic confirmation, channel/clinic/revision/expiry isolation, transfer evidence, idempotency')
} finally {
 await db.execute(sql`DELETE FROM audit_log WHERE clinic_id IN (${clinic},${other})`)
 await db.execute(sql`DELETE FROM integration_tests WHERE clinic_id IN (${clinic},${other})`)
 await db.execute(sql`DELETE FROM managed_integrations WHERE clinic_id IN (${clinic},${other})`)
 await db.execute(sql`DELETE FROM clinics WHERE id IN (${clinic},${other})`)
 await closeDb()
}
