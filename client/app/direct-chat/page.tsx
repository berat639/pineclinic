'use client'

import dynamic from 'next/dynamic'

const DirectChat = dynamic(() => import('./DirectChat'), { ssr: false })

export default function DirectChatPage() {
  return <DirectChat />
}
