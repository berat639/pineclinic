const fs = require('fs');
const file = '/Users/beratincecam/Desktop/voiceai/server/src/api/yonetici.ts';
let content = fs.readFileSync(file, 'utf8');

const routeStr = `
  // ── Integrations ───────────────────────────────────────────────────────────
  .get('/integrations', async ({ cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const { getIntegrations } = await import('../db/repositories/integrations')
    return await getIntegrations()
  })

  .put('/integrations', async ({ body, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const { updateIntegrations } = await import('../db/repositories/integrations')
    await updateIntegrations(body as any)
    return { success: true }
  })
`;

// Inject before the end of the plugin. The file ends with:
//   })
// 
// export default yoneticiPlugin (wait, it's exported at the top)
content = content.replace(/(\n}\)?\n)$/, routeStr + '$1');
fs.writeFileSync(file, content);
