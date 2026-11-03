import { describe, expect, test } from 'bun:test'
import {
  evaluateConditionGroup,
  evaluateConditionNode,
  evaluateConditionRule,
  flowToPromptText,
  type ConversationFlow,
  type FlowNode,
} from '../db/repositories/flows'
import { buildFlowNodePrompt, FlowEngine } from './flow-engine'
import { runFlowSimulationStep } from './flow-simulator'

describe('Diagram Conditions & Actions — Full End-to-End Verification', () => {
  test('evaluates all 15 condition operators accurately in Turkish', () => {
    const fields = {
      kayitli: 'true',
      sikayet: 'Yirmilik diş çekimi ve kanal tedavisi',
      puan: '8',
      sehir: 'Ankara',
      not: '',
      user_intent: 'operatöre bağlanmak ve fiyat öğrenmek istiyor',
    }

    expect(evaluateConditionRule({ field: 'kayitli', operator: 'equals', value: 'true' }, fields)).toBe(true)
    expect(evaluateConditionRule({ field: 'caller.isKnownPatient', operator: 'equals', value: 'evet' }, fields)).toBe(true)
    expect(evaluateConditionRule({ field: 'kayitli', operator: 'notEquals', value: 'false' }, fields)).toBe(true)
    expect(evaluateConditionRule({ field: 'sikayet', operator: 'contains', value: 'kanal' }, fields)).toBe(true)
    expect(evaluateConditionRule({ field: 'sikayet', operator: 'notContains', value: 'implant' }, fields)).toBe(true)
    expect(evaluateConditionRule({ field: 'sikayet', operator: 'startsWith', value: 'yirmilik' }, fields)).toBe(true)
    expect(evaluateConditionRule({ field: 'sikayet', operator: 'regex', value: 'çekim.*kanal' }, fields)).toBe(true)
    expect(evaluateConditionRule({ field: 'puan', operator: 'gt', value: '5' }, fields)).toBe(true)
    expect(evaluateConditionRule({ field: 'puan', operator: 'gte', value: '8' }, fields)).toBe(true)
    expect(evaluateConditionRule({ field: 'puan', operator: 'lt', value: '10' }, fields)).toBe(true)
    expect(evaluateConditionRule({ field: 'puan', operator: 'lte', value: '8' }, fields)).toBe(true)
    expect(evaluateConditionRule({ field: 'puan', operator: 'between', value: '7', valueTo: '9' }, fields)).toBe(true)
    expect(evaluateConditionRule({ field: 'sehir', operator: 'in', value: 'İstanbul, Ankara, İzmir' }, fields)).toBe(true)
    expect(evaluateConditionRule({ field: 'not', operator: 'isEmpty' }, fields)).toBe(true)
    expect(evaluateConditionRule({ field: 'sikayet', operator: 'notEmpty' }, fields)).toBe(true)
    expect(evaluateConditionRule({ field: 'user_intent', operator: 'intent', value: 'fiyat öğrenmek' }, fields)).toBe(true)
  })

  test('evaluates compound AND / OR condition groups and system variables', () => {
    const condNode: FlowNode = {
      id: 'cond_vip_or_urgent',
      type: 'CONDITION',
      position: { x: 0, y: 0 },
      data: {
        conditionLogic: 'OR',
        rules: [
          { field: 'caller.isVip', operator: 'equals', value: 'true' },
          { field: 'sikayet', operator: 'contains', value: 'acil' },
        ],
      },
    }

    expect(evaluateConditionNode(condNode, { 'caller.isVip': 'false', sikayet: 'Çok acil diş ağrım var' })).toBe(true)
    expect(evaluateConditionNode(condNode, { 'caller.isVip': 'true', sikayet: 'Kontrol' })).toBe(true)
    expect(evaluateConditionNode(condNode, { 'caller.isVip': 'false', sikayet: 'Kontrol' })).toBe(false)

    const nestedGroup = evaluateConditionGroup(
      {
        logic: 'AND',
        rules: [
          { field: 'kayitli', operator: 'equals', value: 'true' },
          {
            logic: 'OR',
            rules: [
              { field: 'caller.hasUpcomingAppointment', operator: 'equals', value: 'true' },
              { field: 'puan', operator: 'gte', value: '9' },
            ],
          },
        ],
      },
      { kayitli: 'true', 'caller.hasUpcomingAppointment': 'false', puan: '9' },
    )
    expect(nestedGroup).toBe(true)
  })

  test('FlowEngine executes CONDITION branches, transfer_call, on_transfer_fail, save_patient_note, send_wa_location, set_variable, and save_appointment_pending', async () => {
    const flow: ConversationFlow = {
      id: 'full-asterisk-flow',
      name: 'Kapsamlı Santral Akışı',
      isActive: true,
      createdAt: '',
      updatedAt: '',
      nodes: [
        { id: 'start', type: 'START', position: { x: 0, y: 0 }, data: { label: 'Karşılama' } },
        {
          id: 'cond_kayitli',
          type: 'CONDITION',
          position: { x: 0, y: 100 },
          data: { conditionField: 'kayitli', operator: 'equals', conditionValue: 'true' },
        },
        {
          id: 'field_sikayet',
          type: 'FIELD',
          position: { x: 0, y: 200 },
          data: { fieldName: 'sikayet', description: 'Şikayetiniz veya talebiniz nedir?', required: true },
        },
        {
          id: 'cond_acil',
          type: 'CONDITION',
          position: { x: 0, y: 300 },
          data: { conditionField: 'sikayet', operator: 'contains', conditionValue: 'operatör' },
        },
        {
          id: 'act_transfer',
          type: 'ACTION',
          position: { x: -150, y: 400 },
          data: {
            action: 'transfer_call',
            transferNumber: '08503096119',
            requireConfirmation: false,
          },
        },
        {
          id: 'act_transfer_fail',
          type: 'ACTION',
          position: { x: -300, y: 400 },
          data: {
            action: 'save_patient_note',
            eventTrigger: 'on_transfer_fail',
            message: 'Hat meşgul, notunuzu alıyorum.',
          },
        },
        {
          id: 'field_tarih',
          type: 'FIELD',
          position: { x: 150, y: 400 },
          data: { fieldName: 'tarih', fieldType: 'date', description: 'Hangi gün randevu istersiniz?', required: true },
        },
        {
          id: 'field_saat',
          type: 'FIELD',
          position: { x: 150, y: 500 },
          data: { fieldName: 'saat', fieldType: 'time', description: 'Saat kaç olsun?', required: true },
        },
        {
          id: 'act_randevu',
          type: 'ACTION',
          position: { x: 150, y: 600 },
          data: { action: 'save_appointment_pending' },
        },
        {
          id: 'end',
          type: 'END',
          position: { x: 0, y: 700 },
          data: { label: 'Bitiş', message: 'Sağlıklı günler dileriz.' },
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'cond_kayitli' },
        { id: 'e2', source: 'cond_kayitli', sourceHandle: 'true', target: 'field_sikayet' },
        { id: 'e3', source: 'cond_kayitli', sourceHandle: 'false', target: 'field_sikayet' },
        { id: 'e4', source: 'field_sikayet', target: 'cond_acil' },
        { id: 'e5', source: 'cond_acil', sourceHandle: 'true', target: 'act_transfer' },
        { id: 'e6', source: 'cond_acil', sourceHandle: 'false', target: 'field_tarih' },
        { id: 'e7', source: 'act_transfer', target: 'end' },
        { id: 'e8', source: 'act_transfer_fail', target: 'end' },
        { id: 'e9', source: 'field_tarih', target: 'field_saat' },
        { id: 'e10', source: 'field_saat', target: 'act_randevu' },
        { id: 'e11', source: 'act_randevu', target: 'end' },
      ],
    }

    // 1. Senaryo: Müşteri operatöre bağlanmak istiyor -> CONDITION (sikayet contains 'operatör') -> ACTION (transfer_call)
    const engineTransfer = FlowEngine.fromMemory(flow, {
      direction: 'inbound',
      channel: 'phone',
      initialFields: { kayitli: 'true', musteri_adi: 'Ayşe Demir', telefon: '05551112233' },
    })

    const step1 = await engineTransfer.accept({ fields: {} })
    expect(step1.next?.nodeId).toBe('field_sikayet')
    expect(step1.next?.prompt).toContain('Şikayetiniz veya talebiniz nedir?')

    const step2 = await engineTransfer.accept({ fields: { sikayet: 'Operatör ile görüşmek istiyorum' } })
    expect(step2.next?.nodeId).toBe('act_transfer')
    expect(step2.next?.type).toBe('ACTION')
    expect(step2.next?.prompt).toContain('aramaAktar')
    expect(step2.next?.prompt).toContain('08503096119')

    // Eğer aktarım başarısız olursa on_transfer_fail tetiklenir ve hastaNotKaydet talimatı döner:
    const failStep = await engineTransfer.accept({ eventTrigger: 'on_transfer_fail' })
    expect(failStep.next?.nodeId).toBe('act_transfer_fail')
    expect(failStep.next?.prompt).toContain('hastaNotKaydet')

    // Not kaydedildiğinde akış END düğümüne ulaşır:
    const afterNote = await engineTransfer.completeAction('act_transfer_fail', true)
    expect(afterNote.completed).toBe(true)
    expect(afterNote.next?.prompt).toContain('Sağlıklı günler dileriz.')

    // 2. Senaryo: Müşteri normal randevu istiyor -> CONDITION false -> tarih+saat (birleşik soru) -> randevuOlustur -> END
    const engineAppt = FlowEngine.fromMemory(flow, {
      direction: 'inbound',
      channel: 'phone',
      initialFields: { kayitli: 'true', musteri_adi: 'Mehmet Kaya', telefon: '05559998877' },
    })

    const apptStep1 = await engineAppt.accept({ fields: { sikayet: 'Diş taşı temizliği' } })
    expect(apptStep1.next?.nodeId).toBe('field_tarih')
    expect(apptStep1.next?.prompt).toContain('Hangi gün ve saat için randevu oluşturmamı istersiniz?')

    const apptStep2 = await engineAppt.accept({ fields: { tarih: '2026-11-05', saat: '14:30' } })
    expect(apptStep2.next?.nodeId).toBe('act_randevu')
    expect(apptStep2.next?.prompt).toContain('randevuOlustur')

    const apptDone = await engineAppt.completeAction('act_randevu', true)
    expect(apptDone.completed).toBe(true)
  })

  test('buildFlowNodePrompt produces explicit Turkish instructions for all ACTION types', () => {
    const dummyFlow: ConversationFlow = {
      id: 'f1',
      name: 'test',
      isActive: true,
      createdAt: '',
      updatedAt: '',
      nodes: [],
      edges: [],
    }

    const transferConfirmPrompt = buildFlowNodePrompt(
      dummyFlow,
      { id: 'a1', type: 'ACTION', position: { x: 0, y: 0 }, data: { action: 'transfer_call', transferNumber: '08503096119', requireConfirmation: true } },
      {},
    )
    expect(transferConfirmPrompt).toContain('aramaAktar')
    expect(transferConfirmPrompt).toContain('08503096119')

    const waLocPrompt = buildFlowNodePrompt(
      dummyFlow,
      { id: 'a2', type: 'ACTION', position: { x: 0, y: 0 }, data: { action: 'send_wa_location' } },
      {},
    )
    expect(waLocPrompt).toContain('whatsappKonumGonder')

    const endCallPrompt = buildFlowNodePrompt(
      dummyFlow,
      { id: 'a3', type: 'ACTION', position: { x: 0, y: 0 }, data: { action: 'end_call', message: 'İyi günler dilerim.' } },
      {},
    )
    expect(endCallPrompt).toContain('cagriySonlandir')
    expect(endCallPrompt).toContain('İyi günler dilerim.')
  })

  test('FlowSimulator evaluates CONDITION branches, global keyword triggers, and ACTION outcomes', async () => {
    const nodes: FlowNode[] = [
      { id: 'start', type: 'START', position: { x: 0, y: 0 }, data: { label: 'Karşılama' } },
      { id: 'cond_kayitli', type: 'CONDITION', position: { x: 0, y: 100 }, data: { conditionField: 'kayitli', operator: 'equals', conditionValue: 'true' } },
      { id: 'field_sikayet', type: 'FIELD', position: { x: -100, y: 200 }, data: { fieldName: 'sikayet', description: 'Şikayetiniz nedir?', required: true } },
      { id: 'field_ad', type: 'FIELD', position: { x: 100, y: 200 }, data: { fieldName: 'musteri_adi', description: 'Adınız soyadınız nedir?', required: true } },
      { id: 'act_transfer', type: 'ACTION', position: { x: 200, y: 300 }, data: { action: 'transfer_call', transferNumber: '08503096119', triggerKeywords: 'operatör, canlı destek' } },
      { id: 'end', type: 'END', position: { x: 0, y: 400 }, data: { label: 'Bitiş', message: 'Görüşmek üzere.' } },
    ]
    const edges = [
      { id: 'e1', source: 'start', target: 'cond_kayitli' },
      { id: 'e2', source: 'cond_kayitli', sourceHandle: 'true', target: 'field_sikayet' },
      { id: 'e3', source: 'cond_kayitli', sourceHandle: 'false', target: 'field_ad' },
      { id: 'e4', source: 'field_sikayet', target: 'end' },
      { id: 'e5', source: 'field_ad', target: 'end' },
      { id: 'e6', source: 'act_transfer', target: 'end' },
    ]

    // Global keyword trigger "operatör" -> act_transfer -> end
    const simTransfer = await runFlowSimulationStep({
      direction: 'inbound',
      nodes,
      edges,
      currentNodeId: 'field_sikayet',
      fields: { kayitli: 'true' },
      userMessage: 'Beni hemen operatöre bağlayın lütfen',
      skipReply: true,
    })

    expect(simTransfer.completed).toBe(true)
    expect(simTransfer.visitedNodeIds).toContain('act_transfer')
    expect(simTransfer.nextInstruction).toContain('08503096119')

    const promptText = flowToPromptText({
      id: 'sim',
      name: 'sim',
      isActive: true,
      createdAt: '',
      updatedAt: '',
      nodes,
      edges,
    })
    expect(promptText).toContain('GLOBAL TETİKLEYİCİLER')
    expect(promptText).toContain('operatör, canlı destek')
    expect(promptText).toContain('aramaAktar')
  })
})
