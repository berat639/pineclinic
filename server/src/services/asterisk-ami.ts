import net from 'net'

export interface AmiConfig {
  host: string
  port: number
  username: string
  secret: string
}

function getAmiConfig(): AmiConfig {
  return {
    host: process.env.ASTERISK_AMI_HOST || 'pineclinic-asterisk',
    port: parseInt(process.env.ASTERISK_AMI_PORT || '5038', 10),
    username: process.env.ASTERISK_AMI_USER || 'voiceai',
    secret: process.env.ASTERISK_AMI_SECRET || 'pineclinic_ami_secret_123',
  }
}

/**
 * Execute a command/action on Asterisk AMI with timeout
 */
export async function sendAmiAction(action: Record<string, string>, timeoutMs = 5000): Promise<{ success: boolean; message: string; raw?: string }> {
  const config = getAmiConfig()

  return new Promise((resolve) => {
    let resolved = false
    const socket = new net.Socket()
    let buffer = ''
    let loggedIn = false

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        socket.destroy()
        resolve({ success: false, message: 'AMI bağlantı zaman aşımı' })
      }
    }, timeoutMs)

    function finish(result: { success: boolean; message: string; raw?: string }) {
      if (!resolved) {
        resolved = true
        clearTimeout(timer)
        socket.end()
        resolve(result)
      }
    }

    socket.connect(config.port, config.host, () => {
      // Wait for Asterisk banner
    })

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf-8')

      // Check for Asterisk banner
      if (!loggedIn && buffer.includes('Asterisk Call Manager')) {
        // Send Login
        const loginAction = `Action: Login\r\nUsername: ${config.username}\r\nSecret: ${config.secret}\r\nEvents: off\r\n\r\n`
        socket.write(loginAction)
        buffer = ''
        return
      }

      // Check for Login Response
      if (!loggedIn && buffer.includes('Response: Success')) {
        loggedIn = true
        buffer = ''

        // Format and send main Action
        let actionStr = ''
        for (const [k, v] of Object.entries(action)) {
          actionStr += `${k}: ${v}\r\n`
        }
        actionStr += '\r\n'
        socket.write(actionStr)
        return
      }

      if (!loggedIn && (buffer.includes('Response: Error') || buffer.includes('Authentication failed'))) {
        finish({ success: false, message: 'AMI kimlik doğrulama hatası', raw: buffer })
        return
      }

      // If logged in and response received for action
      if (loggedIn && buffer.includes('Response:')) {
        const isSuccess = buffer.includes('Response: Success')
        const messageMatch = buffer.match(/Message:\s*([^\r\n]+)/i)
        const msg = messageMatch ? messageMatch[1] : (isSuccess ? 'İşlem başarılı' : 'İşlem başarısız')
        
        // Logoff nicely
        try { socket.write('Action: Logoff\r\n\r\n') } catch {}
        finish({ success: isSuccess, message: msg, raw: buffer })
      }
    })

    socket.on('error', (err) => {
      finish({ success: false, message: `AMI soket hatası: ${err.message}` })
    })

    socket.on('close', () => {
      if (!resolved) {
        finish({ success: false, message: 'AMI bağlantısı kapandı' })
      }
    })
  })
}

/**
 * Redirect an active call to target extension/number in dynamic-forward context
 */
export async function transferCall(channel: string, targetNumber: string): Promise<{ success: boolean; message: string }> {
  console.log(`[AMI] Çağrı aktarılıyor: channel=${channel} -> target=${targetNumber}`)
  
  const cleanNumber = targetNumber.replace(/\D/g, '')
  if (!cleanNumber) {
    return { success: false, message: 'Geçersiz hedef telefon numarası' }
  }

  const res = await sendAmiAction({
    Action: 'Redirect',
    Channel: channel,
    Context: 'dynamic-forward',
    Exten: cleanNumber,
    Priority: '1',
  })

  console.log(`[AMI] Aktarım sonucu:`, res)
  return res
}

/**
 * Initiate an outbound call to a customer via Netgsm and bridge it to outbound-ai
 */
export async function initiateOutboundCall(customerNumber: string, callerId: string): Promise<{ success: boolean; message: string }> {
  console.log(`[AMI] Dış arama başlatılıyor: heden=${customerNumber}, callerId=${callerId}`)
  
  const cleanNumber = customerNumber.replace(/\D/g, '')
  if (!cleanNumber) {
    return { success: false, message: 'Geçersiz müşteri telefon numarası' }
  }

  const res = await sendAmiAction({
    Action: 'Originate',
    Channel: `PJSIP/${cleanNumber}@netgsm-endpoint`,
    Context: 'outbound-ai',
    Exten: 's',
    Priority: '1',
    CallerID: `Pine Klinik <${callerId}>`,
    Variable: `CUSTOMER_NUMBER=${cleanNumber}`,
    Async: 'true',
  })

  console.log(`[AMI] Dış arama sonucu:`, res)
  return res
}
