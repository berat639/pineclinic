const fs = require('fs')
const path = require('path')
const srcDir = '/Users/beratincecam/Desktop/voiceai/server/src'
const files = fs.readdirSync(srcDir, { recursive: true })
  .filter(f => f.endsWith('.ts'))
  .map(f => path.join(srcDir, f))

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8')
  let changed = false
  
  if (content.includes('cookie.token?.value')) {
    content = content.replace(/cookie\.token\?\.value\b/g, '(cookie.token?.value as string | undefined)')
    changed = true
  }
  
  // also fix the doctors import in host.ts
  if (file.endsWith('src/api/host.ts')) {
    if (content.includes('doctors,')) {
      content = content.replace('doctors,', '')
      changed = true
    }
  }

  // also fix migrate-from-json.ts error
  if (file.endsWith('migrate-from-json.ts')) {
    content = content.replace(/values\(\[(.*?)\]\)/g, 'values([$1] as any)')
    changed = true
  }

  if (changed) {
    fs.writeFileSync(file, content)
    console.log('Fixed', file)
  }
}
